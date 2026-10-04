-- =========================================================================
-- MIGRATION: 001_secure_sigilopay.sql
-- Objetivo: Revogar políticas inseguras anônimas e proteger dados de pedidos,
--           adicionando campos de transação, webhook token e guest token do Sigilo Pay.
-- =========================================================================

-- 1. Revogar políticas antigas inseguras (que permitiam anon INSERT e SELECT irrestritos)
DROP POLICY IF EXISTS "Permitir insercao anonima de pedidos" ON public.orders;
DROP POLICY IF EXISTS "Permitir leitura anonima de pedidos por ID" ON public.orders;
DROP POLICY IF EXISTS "Permitir leitura pública" ON public.orders;
DROP POLICY IF EXISTS "Permitir escrita pública" ON public.orders;

-- 2. Garantir que a tabela orders existe com as colunas base
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT NOT NULL,
    customer_cpf TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    street TEXT NOT NULL,
    house_number TEXT NOT NULL,
    complement TEXT,
    district TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    include_cream BOOLEAN NOT NULL DEFAULT FALSE,
    total_price NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'pix',
    status TEXT NOT NULL DEFAULT 'pending',
    pix_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Adicionar novas colunas necessárias para a integração segura Sigilo Pay
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS transaction_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS identifier TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS webhook_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_token TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS gateway_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

-- 4. Criar índices para buscas de alta performance por identificadores e tokens
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_identifier ON public.orders (identifier);
CREATE INDEX IF NOT EXISTS idx_orders_transaction_id ON public.orders (transaction_id);
CREATE INDEX IF NOT EXISTS idx_orders_guest_token ON public.orders (guest_token);

-- 5. Ativar RLS estrito: Nenhum acesso anônimo direto à tabela orders.
-- Apenas service_role (backend autenticado do servidor) tem acesso para ler/escrever pedidos.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Política restrita apenas para service_role
DROP POLICY IF EXISTS "Acesso exclusivo service_role" ON public.orders;
CREATE POLICY "Acesso exclusivo service_role"
ON public.orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
