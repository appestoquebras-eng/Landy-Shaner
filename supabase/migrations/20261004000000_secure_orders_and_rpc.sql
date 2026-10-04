-- =========================================================================
-- MIGRATION: 20261004000000_secure_orders_and_rpc.sql
-- Projeto: Landy Shaner & Sigilo Pay
-- Compatibilidade: Executável em banco totalmente vazio ou com tabela existente.
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Criação ou atualização da tabela orders
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,
    identifier TEXT NOT NULL UNIQUE,
    idempotency_key TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_cpf TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    street TEXT NOT NULL,
    house_number TEXT NOT NULL,
    complement TEXT,
    district TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 10),
    include_cream BOOLEAN NOT NULL DEFAULT FALSE,
    total_price NUMERIC(10, 2) NOT NULL CHECK (total_price > 0),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency TEXT NOT NULL DEFAULT 'BRL',
    payment_method TEXT NOT NULL DEFAULT 'PIX',
    status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'pending', 'uncertain', 'paid', 'canceled', 'refunded', 'charged_back')),
    pix_code TEXT,
    pix_image TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    transaction_id TEXT UNIQUE,
    webhook_token TEXT,
    guest_token_hash TEXT NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    gateway_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Garantir adição de colunas caso a tabela já tenha existido previamente
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='expires_at') THEN
        ALTER TABLE public.orders ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='idempotency_key') THEN
        ALTER TABLE public.orders ADD COLUMN idempotency_key TEXT UNIQUE;
    END IF;
    -- Atualiza constraint de status caso necessário
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('creating', 'pending', 'uncertain', 'paid', 'canceled', 'refunded', 'charged_back'));
END $$;

-- 2. Índices de alta performance e integridade
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_identifier ON public.orders (identifier);
CREATE INDEX IF NOT EXISTS idx_orders_transaction_id ON public.orders (transaction_id);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_guest_token_hash ON public.orders (guest_token_hash);
CREATE INDEX IF NOT EXISTS idx_orders_customer_recent ON public.orders (customer_cpf, created_at);

-- 3. RLS e revogação de acessos públicos
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir insercao anonima de pedidos" ON public.orders;
DROP POLICY IF EXISTS "Permitir leitura anonima de pedidos por ID" ON public.orders;
DROP POLICY IF EXISTS "Permitir leitura pública" ON public.orders;
DROP POLICY IF EXISTS "Permitir escrita pública" ON public.orders;
DROP POLICY IF EXISTS "Acesso exclusivo service_role" ON public.orders;

REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.orders TO service_role;

CREATE POLICY "Acesso exclusivo service_role"
ON public.orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =========================================================================
-- 4. RPC ATÔMICO COM ADVISORY LOCK: Criar ou obter pedido com deduplicação
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_or_get_pending_order(
    p_idempotency_key TEXT,
    p_order_id TEXT,
    p_identifier TEXT,
    p_customer_name TEXT,
    p_customer_email TEXT,
    p_customer_phone TEXT,
    p_customer_cpf TEXT,
    p_postal_code TEXT,
    p_street TEXT,
    p_house_number TEXT,
    p_complement TEXT,
    p_district TEXT,
    p_city TEXT,
    p_state TEXT,
    p_quantity INTEGER,
    p_include_cream BOOLEAN,
    p_total_price NUMERIC,
    p_amount_cents INTEGER,
    p_guest_token_hash TEXT
)
RETURNS TABLE (
    existing BOOLEAN,
    is_abusive BOOLEAN,
    token_mismatch BOOLEAN,
    order_id TEXT,
    identifier TEXT,
    status TEXT,
    pix_code TEXT,
    pix_image TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    total_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_order RECORD;
    v_recent_attempts INTEGER;
BEGIN
    -- 1. Bloqueio transacional advisory lock pela chave de idempotência para serializar chamadas simultâneas
    PERFORM pg_advisory_xact_lock(hashtext(p_idempotency_key));

    -- 2. Proteção contra abuso no banco (máximo 15 tentativas por CPF na última hora)
    SELECT COUNT(*) INTO v_recent_attempts
    FROM public.orders o
    WHERE o.customer_cpf = p_customer_cpf
      AND o.created_at > (now() - interval '1 hour');

    IF v_recent_attempts >= 15 THEN
        RETURN QUERY SELECT
            FALSE, TRUE, FALSE, NULL::TEXT, NULL::TEXT, 'abusive'::TEXT, NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::NUMERIC;
        RETURN;
    END IF;

    -- 3. Verifica se já existe pedido para esta chave estável de idempotência
    SELECT o.order_id, o.identifier, o.status, o.pix_code, o.pix_image, o.expires_at, o.total_price, o.guest_token_hash
    INTO v_existing_order
    FROM public.orders o
    WHERE o.idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
        -- Validação de segurança: o guest_token_hash precisa corresponder ao da intenção original
        IF v_existing_order.guest_token_hash <> p_guest_token_hash THEN
            RETURN QUERY SELECT
                TRUE, FALSE, TRUE, v_existing_order.order_id, v_existing_order.identifier, v_existing_order.status,
                NULL::TEXT, NULL::TEXT, NULL::TIMESTAMPTZ, v_existing_order.total_price;
            RETURN;
        END IF;

        RETURN QUERY SELECT
            TRUE,
            FALSE,
            FALSE,
            v_existing_order.order_id,
            v_existing_order.identifier,
            v_existing_order.status,
            v_existing_order.pix_code,
            v_existing_order.pix_image,
            v_existing_order.expires_at,
            v_existing_order.total_price;
        RETURN;
    END IF;

    -- 4. Criação atômica preliminar em estado 'creating' com identifier persistido ANTES da chamada ao gateway
    INSERT INTO public.orders (
        order_id,
        identifier,
        idempotency_key,
        customer_name,
        customer_email,
        customer_phone,
        customer_cpf,
        postal_code,
        street,
        house_number,
        complement,
        district,
        city,
        state,
        quantity,
        include_cream,
        total_price,
        amount_cents,
        currency,
        payment_method,
        status,
        guest_token_hash,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        p_identifier,
        p_idempotency_key,
        p_customer_name,
        p_customer_email,
        p_customer_phone,
        p_customer_cpf,
        p_postal_code,
        p_street,
        p_house_number,
        p_complement,
        p_district,
        p_city,
        p_state,
        p_quantity,
        p_include_cream,
        p_total_price,
        p_amount_cents,
        'BRL',
        'PIX',
        'creating',
        p_guest_token_hash,
        now(),
        now()
    );

    RETURN QUERY SELECT
        FALSE,
        FALSE,
        FALSE,
        p_order_id,
        p_identifier,
        'creating'::TEXT,
        NULL::TEXT,
        NULL::TEXT,
        NULL::TIMESTAMPTZ,
        p_total_price;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_or_get_pending_order FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_or_get_pending_order TO service_role;

-- =========================================================================
-- 5. RPC ATÔMICO: Anexar dados retornados da Sigilo Pay (qualificação explícita)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rpc_attach_sigilopay_charge(
    p_order_id TEXT,
    p_identifier TEXT,
    p_transaction_id TEXT,
    p_webhook_token TEXT,
    p_pix_code TEXT,
    p_pix_image TEXT,
    p_expires_at TIMESTAMP WITH TIME ZONE,
    p_gateway_status TEXT,
    p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.orders
    SET identifier = p_identifier,
        transaction_id = p_transaction_id,
        webhook_token = p_webhook_token,
        pix_code = p_pix_code,
        pix_image = p_pix_image,
        expires_at = p_expires_at,
        gateway_status = p_gateway_status,
        status = p_status,
        updated_at = now()
    WHERE public.orders.order_id = p_order_id;

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_attach_sigilopay_charge FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_attach_sigilopay_charge TO service_role;

-- =========================================================================
-- 6. RPC ATÔMICO: Confirmação Estrita e Idempotente de Pagamento
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_sigilopay_payment(
    p_transaction_id TEXT,
    p_identifier TEXT,
    p_payed_at TIMESTAMP WITH TIME ZONE,
    p_gateway_status TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    action TEXT,
    order_id TEXT,
    current_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Bloqueio da linha com FOR UPDATE exigindo AMBOS transaction_id E identifier
    SELECT o.id, o.order_id, o.status, o.amount_cents
    INTO v_order
    FROM public.orders o
    WHERE o.transaction_id = p_transaction_id
      AND o.identifier = p_identifier
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'ORDER_NOT_FOUND', NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- Proteção contra retrocesso: estados estornados/chargeback NÃO voltam para paid
    IF v_order.status IN ('refunded', 'charged_back') THEN
        RETURN QUERY SELECT FALSE, 'TERMINAL_STATE_CANNOT_REVERT', v_order.order_id, v_order.status;
        RETURN;
    END IF;

    -- Idempotência: se já está pago, não reprocessa
    IF v_order.status = 'paid' THEN
        RETURN QUERY SELECT TRUE, 'ALREADY_PAID', v_order.order_id, v_order.status;
        RETURN;
    END IF;

    -- Atualiza atomicamente para paid
    UPDATE public.orders
    SET status = 'paid',
        paid_at = COALESCE(p_payed_at, now()),
        gateway_status = COALESCE(p_gateway_status, 'COMPLETED'),
        updated_at = now()
    WHERE public.orders.id = v_order.id;

    RETURN QUERY SELECT TRUE, 'PAYMENT_CONFIRMED', v_order.order_id, 'paid'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_confirm_sigilopay_payment FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_sigilopay_payment TO service_role;

-- =========================================================================
-- 7. RPC ATÔMICO: Cancelamento, Estorno ou Chargeback
-- =========================================================================
CREATE OR REPLACE FUNCTION public.rpc_update_order_cancellation(
    p_transaction_id TEXT,
    p_identifier TEXT,
    p_new_status TEXT,
    p_gateway_status TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    action TEXT,
    order_id TEXT,
    current_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT o.id, o.order_id, o.status
    INTO v_order
    FROM public.orders o
    WHERE o.transaction_id = p_transaction_id
      AND o.identifier = p_identifier
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'ORDER_NOT_FOUND', NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    -- Pedido já pago não pode ser cancelado via TRANSACTION_CANCELED (apenas refund/chargeback são permitidos)
    IF v_order.status = 'paid' AND p_new_status = 'canceled' THEN
        RETURN QUERY SELECT FALSE, 'PAID_CANNOT_BE_CANCELED', v_order.order_id, v_order.status;
        RETURN;
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        gateway_status = p_gateway_status,
        updated_at = now()
    WHERE public.orders.id = v_order.id;

    RETURN QUERY SELECT TRUE, 'STATUS_UPDATED', v_order.order_id, p_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_order_cancellation FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_order_cancellation TO service_role;
