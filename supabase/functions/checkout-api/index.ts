// =========================================================================
// SUPABASE EDGE FUNCTION: checkout-api
// Runtime: Deno (100% Free no Supabase Edge Functions)
// Endpoints:
//   - POST /create  -> Cria cobrança Pix real na Sigilo Pay com catálogo seguro
//   - GET  /status  -> Consulta segura de status para convidados com hash SHA-256
//   - POST /webhook -> Webhook Sigilo Pay com verificação estrita e RPC atômico
//   - GET  /health  -> Checagem de disponibilidade
// =========================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

// Configurações do Catálogo no Servidor
const CATALOG = {
  KIT_ID: 'kit-depilador-4em1',
  KIT_NAME: 'Kit Depilador 4 em 1 Landy Shaner',
  KIT_PRICE_CENTS: 3490, // R$ 34,90
  CREAM_ID: 'creme-clareador-clear-beauty',
  CREAM_NAME: 'Creme Clareador Íntimo e Corporal Clear Beauty',
  CREAM_PRICE_CENTS: 1500, // R$ 15,00
  CURRENCY: 'BRL',
};

// Variáveis de Ambiente do Supabase e Sigilo Pay
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const SIGILOPAY_PUBLIC_KEY = Deno.env.get('SIGILOPAY_PUBLIC_KEY') || '';
const SIGILOPAY_SECRET_KEY = Deno.env.get('SIGILOPAY_SECRET_KEY') || '';
const SIGILOPAY_CALLBACK_URL = Deno.env.get('SIGILOPAY_CALLBACK_URL') || '';
const SIGILOPAY_BASE_URL = Deno.env.get('SIGILOPAY_BASE_URL') || 'https://app.sigilopay.com.br/api/v1';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '*').split(',').map((o) => o.trim());

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Helper de Headers CORS restrito
function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin =
    ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)
      ? origin || '*'
      : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
    'Content-Type': 'application/json',
  };
}

// Helpers Criptográficos Deno
async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function sanitizeDigits(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/\D/g, '');
}

function calculateOrderAmounts(quantity: number, includeCream: boolean) {
  const safeQty = Math.max(1, Math.floor(quantity || 1));
  const kitTotalCents = safeQty * CATALOG.KIT_PRICE_CENTS;
  const creamTotalCents = includeCream ? CATALOG.CREAM_PRICE_CENTS : 0;
  const amountCents = kitTotalCents + creamTotalCents;
  const amountReais = Number((amountCents / 100).toFixed(2));

  const items = [
    {
      id: CATALOG.KIT_ID,
      name: CATALOG.KIT_NAME,
      quantity: safeQty,
      price: Number((CATALOG.KIT_PRICE_CENTS / 100).toFixed(2)),
      physical: true,
    },
  ];

  if (includeCream) {
    items.push({
      id: CATALOG.CREAM_ID,
      name: CATALOG.CREAM_NAME,
      quantity: 1,
      price: Number((CATALOG.CREAM_PRICE_CENTS / 100).toFixed(2)),
      physical: true,
    });
  }

  return { amountCents, amountReais, items };
}

// Servidor HTTP Deno
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathname = url.pathname.replace(/^\/checkout-api/, '');

  try {
    // -----------------------------------------------------------------------
    // HEALTH CHECK / CONFIG STATUS
    // -----------------------------------------------------------------------
    if (pathname === '/health' || pathname === '' || pathname === '/') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'landy-shaner-edge-checkout',
          sigilopayConfigured: Boolean(SIGILOPAY_PUBLIC_KEY && SIGILOPAY_SECRET_KEY && SIGILOPAY_CALLBACK_URL),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // -----------------------------------------------------------------------
    // 1. CRIAR COBRANÇA PIX COM DESDUPLICAÇÃO DURÁVEL
    // -----------------------------------------------------------------------
    if (pathname === '/create' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const {
        name,
        email,
        phone,
        document,
        postalCode,
        street,
        houseNumber,
        complement,
        district,
        city,
        state,
        quantity,
        includeCream,
      } = body;

      // Validação estrita sem remover dígitos de nome e e-mail
      if (!name || typeof name !== 'string' || name.trim().split(' ').length < 2) {
        return new Response(
          JSON.stringify({ success: false, error: { message: 'Nome completo obrigatório (nome e sobrenome).' } }),
          { status: 400, headers: corsHeaders }
        );
      }

      const cleanCpf = sanitizeDigits(document);
      if (cleanCpf.length !== 11) {
        return new Response(
          JSON.stringify({ success: false, error: { message: 'CPF inválido (11 dígitos).' } }),
          { status: 400, headers: corsHeaders }
        );
      }

      const cleanPhone = sanitizeDigits(phone);
      if (cleanPhone.length < 10) {
        return new Response(
          JSON.stringify({ success: false, error: { message: 'Telefone com DDD inválido.' } }),
          { status: 400, headers: corsHeaders }
        );
      }

      const cleanCep = sanitizeDigits(postalCode);
      if (cleanCep.length !== 8) {
        return new Response(
          JSON.stringify({ success: false, error: { message: 'CEP inválido (8 dígitos).' } }),
          { status: 400, headers: corsHeaders }
        );
      }

      if (!street || !houseNumber || !district || !city || !state) {
        return new Response(
          JSON.stringify({ success: false, error: { message: 'Endereço de entrega incompleto.' } }),
          { status: 400, headers: corsHeaders }
        );
      }

      const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
      const safeIncludeCream = Boolean(includeCream);
      const { amountCents, amountReais, items } = calculateOrderAmounts(safeQuantity, safeIncludeCream);

      // Chave de desduplicação durável (evita cobrança dupla entre instâncias do Edge)
      const idempotencyKey = await sha256Hex(
        `idem_${cleanCpf}_${cleanPhone}_${safeQuantity}_${safeIncludeCream}_${Math.floor(Date.now() / 900000)}`
      );

      // Gera tokens e IDs
      const rawGuestToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
      const guestTokenHash = await sha256Hex(rawGuestToken);
      const randomOrderSuffix = Math.floor(100000 + Math.random() * 900000);
      const newOrderId = `LS-${randomOrderSuffix}`;

      // RPC atômico de desduplicação durável no banco
      const { data: orderAttempt, error: rpcError } = await supabaseAdmin.rpc(
        'rpc_create_or_get_pending_order',
        {
          p_idempotency_key: idempotencyKey,
          p_order_id: newOrderId,
          p_customer_name: name.trim(),
          p_customer_email: email ? String(email).trim().toLowerCase() : null,
          p_customer_phone: cleanPhone,
          p_customer_cpf: cleanCpf,
          p_postal_code: cleanCep,
          p_street: String(street).trim(),
          p_house_number: String(houseNumber).trim(),
          p_complement: complement ? String(complement).trim() : null,
          p_district: String(district).trim(),
          p_city: String(city).trim(),
          p_state: String(state).trim().toUpperCase(),
          p_quantity: safeQuantity,
          p_include_cream: safeIncludeCream,
          p_total_price: amountReais,
          p_amount_cents: amountCents,
          p_guest_token_hash: guestTokenHash,
        }
      );

      if (rpcError) {
        console.error('Erro no RPC create_or_get_pending_order:', rpcError.message);
        return new Response(
          JSON.stringify({ success: false, error: { message: 'Erro no banco ao registrar pedido.' } }),
          { status: 500, headers: corsHeaders }
        );
      }

      const orderRow = Array.isArray(orderAttempt) ? orderAttempt[0] : orderAttempt;

      // Se já existia um pedido pendente ativo recente, reutiliza-o sem chamar a Sigilo Pay novamente
      if (orderRow?.existing && orderRow?.pix_code) {
        return new Response(
          JSON.stringify({
            success: true,
            orderId: orderRow.order_id,
            guestToken: rawGuestToken, // Convidado continua autenticado
            pixCode: orderRow.pix_code,
            pixImage: orderRow.pix_image || null,
            totalPrice: Number(orderRow.total_price),
            status: orderRow.status,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Verificação de credenciais antes de chamar gateway
      if (!SIGILOPAY_PUBLIC_KEY || !SIGILOPAY_SECRET_KEY || !SIGILOPAY_CALLBACK_URL) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              errorCode: 'GATEWAY_NOT_CONFIGURED',
              message:
                'Credenciais da Sigilo Pay não configuradas no servidor (SIGILOPAY_PUBLIC_KEY, SIGILOPAY_SECRET_KEY, SIGILOPAY_CALLBACK_URL).',
            },
          }),
          { status: 503, headers: corsHeaders }
        );
      }

      const activeOrderId = orderRow.order_id || newOrderId;
      const attemptIdentifier = `sig_${activeOrderId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}_${Date.now()}`;

      // Chamada HTTP para a API oficial da Sigilo Pay com Timeout de 15s
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      try {
        const sigiloRes = await fetch(`${SIGILOPAY_BASE_URL}/gateway/pix/receive`, {
          method: 'POST',
          headers: {
            'x-public-key': SIGILOPAY_PUBLIC_KEY,
            'x-secret-key': SIGILOPAY_SECRET_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            identifier: attemptIdentifier,
            amount: amountReais,
            client: {
              name: name.trim(), // Nome com letras e espaços preservados
              email: email ? String(email).trim().toLowerCase() : undefined, // Email preservado
              phone: cleanPhone,
              document: cleanCpf,
            },
            products: items,
            callbackUrl: SIGILOPAY_CALLBACK_URL,
            metadata: {
              provider: 'Checkout',
              orderId: activeOrderId,
            },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const sigiloJson = await sigiloRes.json().catch(() => ({}));

        if (!sigiloRes.ok) {
          // Marca estado incerto caso gateway retorne erro
          await supabaseAdmin.rpc('rpc_attach_sigilopay_charge', {
            p_order_id: activeOrderId,
            p_identifier: attemptIdentifier,
            p_transaction_id: null,
            p_webhook_token: null,
            p_pix_code: null,
            p_pix_image: null,
            p_gateway_status: 'FAILED',
            p_status: 'uncertain',
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: {
                statusCode: sigiloRes.status,
                message: sigiloJson.message || 'Erro retornado pela Sigilo Pay ao gerar cobrança.',
                details: sigiloJson,
              },
            }),
            { status: sigiloRes.status, headers: corsHeaders }
          );
        }

        const transactionId = String(sigiloJson.transactionId || sigiloJson.id || '');
        const webhookToken = String(sigiloJson.webhookToken || sigiloJson.token || '');
        const pixCode = sigiloJson.pix?.code || sigiloJson.pixCode || '';
        const pixImage = sigiloJson.pix?.image || null; // Opcional
        const gatewayStatus = sigiloJson.transactionStatus || sigiloJson.status || 'WAITING_PAYMENT';

        if (!pixCode) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { message: 'A Sigilo Pay não retornou o código Pix na resposta.' },
            }),
            { status: 502, headers: corsHeaders }
          );
        }

        // Anexa dados recebidos do gateway via RPC atômico
        await supabaseAdmin.rpc('rpc_attach_sigilopay_charge', {
          p_order_id: activeOrderId,
          p_identifier: attemptIdentifier,
          p_transaction_id: transactionId,
          p_webhook_token: webhookToken,
          p_pix_code: pixCode,
          p_pix_image: pixImage,
          p_gateway_status: gatewayStatus,
          p_status: 'pending',
        });

        return new Response(
          JSON.stringify({
            success: true,
            orderId: activeOrderId,
            guestToken: rawGuestToken,
            pixCode,
            pixImage,
            totalPrice: amountReais,
            status: 'pending',
          }),
          { status: 200, headers: corsHeaders }
        );
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        // Em caso de timeout, marca como 'uncertain' para não duplicar cobrança cegamente
        await supabaseAdmin.rpc('rpc_attach_sigilopay_charge', {
          p_order_id: activeOrderId,
          p_identifier: attemptIdentifier,
          p_transaction_id: null,
          p_webhook_token: null,
          p_pix_code: null,
          p_pix_image: null,
          p_gateway_status: 'TIMEOUT',
          p_status: 'uncertain',
        });

        return new Response(
          JSON.stringify({
            success: false,
            error: {
              errorCode: 'GATEWAY_TIMEOUT',
              message: 'Tempo limite esgotado ao contatar Sigilo Pay. Status registrado como incerto.',
            },
          }),
          { status: 504, headers: corsHeaders }
        );
      }
    }

    // -----------------------------------------------------------------------
    // 2. CONSULTA SEGURA DE STATUS PARA CONVIDADO
    // -----------------------------------------------------------------------
    if (pathname === '/status' && req.method === 'GET') {
      const orderId = url.searchParams.get('orderId') || '';
      const guestToken = url.searchParams.get('token') || '';

      if (!orderId || !guestToken) {
        return new Response(
          JSON.stringify({ success: false, error: 'orderId e token são obrigatórios.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const inputHash = await sha256Hex(guestToken);

      const { data: order, error } = await supabaseAdmin
        .from('orders')
        .select('order_id, status, paid_at, total_price, quantity, include_cream, pix_code, pix_image, guest_token_hash')
        .eq('order_id', orderId)
        .maybeSingle();

      if (error || !order) {
        return new Response(
          JSON.stringify({ success: false, error: 'Pedido não localizado.' }),
          { status: 404, headers: corsHeaders }
        );
      }

      // Validação estrita do hash do token
      if (!timingSafeEqualStr(order.guest_token_hash || '', inputHash)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Acesso não autorizado para este pedido.' }),
          { status: 403, headers: corsHeaders }
        );
      }

      // Retorna APENAS o estritamente necessário (Zero vazamento de dados pessoais ou segredos)
      return new Response(
        JSON.stringify({
          success: true,
          orderId: order.order_id,
          status: order.status,
          paidAt: order.paid_at || null,
          totalPrice: Number(order.total_price),
          quantity: order.quantity,
          includeCream: order.include_cream,
          pixCode: order.pix_code,
          pixImage: order.pix_image || null,
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // -----------------------------------------------------------------------
    // 3. WEBHOOK OFICIAL SIGILO PAY (POST /webhook)
    // -----------------------------------------------------------------------
    if (pathname === '/webhook' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { event, token, transaction } = body;

      if (!token || !transaction) {
        return new Response(
          JSON.stringify({ error: 'Payload inválido: token e transaction são obrigatórios.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const transactionId = String(transaction.id || '');
      const identifier = String(transaction.identifier || '');

      // Busca pedido por transaction_id ou identifier com lock/consulta
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('*')
        .or(`transaction_id.eq.${transactionId},identifier.eq.${identifier}`)
        .maybeSingle();

      if (orderErr || !order) {
        return new Response(
          JSON.stringify({ error: 'Pedido correspondente não localizado.' }),
          { status: 404, headers: corsHeaders }
        );
      }

      // Validação estrita timingSafeEqual do webhookToken
      if (!order.webhook_token || !timingSafeEqualStr(order.webhook_token, String(token))) {
        console.warn(`[SigiloPay Webhook] Tentativa rejeitada: token inválido para pedido ${order.order_id}`);
        return new Response(
          JSON.stringify({ error: 'Token de autenticação do webhook inválido.' }),
          { status: 401, headers: corsHeaders }
        );
      }

      // Idempotência imediata se já estiver pago
      if (order.status === 'paid' && (event === 'TRANSACTION_PAID' || transaction.status === 'COMPLETED')) {
        return new Response(
          JSON.stringify({ received: true, status: 'already_paid' }),
          { status: 200, headers: corsHeaders }
        );
      }

      // VERIFICAÇÃO RIGOROSA: Exige AMBOS event===TRANSACTION_PAID E status===COMPLETED E paymentMethod===PIX
      const isPaidEvent =
        event === 'TRANSACTION_PAID' &&
        transaction.status === 'COMPLETED' &&
        transaction.paymentMethod === 'PIX';

      if (isPaidEvent) {
        // Validação de moeda
        if (String(transaction.currency || '').toUpperCase() !== 'BRL') {
          return new Response(
            JSON.stringify({ error: 'Moeda incompatível: esperado BRL.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Validação de consistência cruzada de identificadores
        if (transaction.id !== order.transaction_id || transaction.identifier !== order.identifier) {
          return new Response(
            JSON.stringify({ error: 'Identificadores de transação inconsistentes com a cobrança salva.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Validação exata de valor em centavos
        const receivedCents = Math.round(Number(transaction.amount) * 100);
        if (receivedCents !== order.amount_cents) {
          console.error(
            `[SigiloPay Webhook] Valor divergente: esperado ${order.amount_cents} centavos, recebido ${receivedCents} centavos.`
          );
          return new Response(
            JSON.stringify({ error: 'Valor da transação não confere com o pedido.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Confirmação atômica via RPC
        const { data: confirmRes, error: confirmErr } = await supabaseAdmin.rpc(
          'rpc_confirm_sigilopay_payment',
          {
            p_transaction_id: transactionId,
            p_identifier: identifier,
            p_payed_at: transaction.payedAt || new Date().toISOString(),
            p_gateway_status: 'COMPLETED',
          }
        );

        if (confirmErr) {
          return new Response(
            JSON.stringify({ error: 'Falha ao confirmar pagamento no banco.' }),
            { status: 500, headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({ received: true, status: 'paid_confirmed', data: confirmRes }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Tratamento de cancelamentos e estornos
      if (event === 'TRANSACTION_CANCELED' || transaction.status === 'CANCELED') {
        await supabaseAdmin.rpc('rpc_update_order_cancellation', {
          p_transaction_id: transactionId,
          p_identifier: identifier,
          p_new_status: 'canceled',
          p_gateway_status: 'CANCELED',
        });
        return new Response(
          JSON.stringify({ received: true, status: 'canceled' }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (event === 'TRANSACTION_REFUNDED' || transaction.status === 'REFUNDED') {
        await supabaseAdmin.rpc('rpc_update_order_cancellation', {
          p_transaction_id: transactionId,
          p_identifier: identifier,
          p_new_status: 'refunded',
          p_gateway_status: 'REFUNDED',
        });
        return new Response(
          JSON.stringify({ received: true, status: 'refunded' }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Eventos não-terminais
      return new Response(
        JSON.stringify({ received: true, status: 'event_acknowledged' }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Rota não encontrada.' }),
      { status: 404, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('Exceção no checkout-api:', err);
    return new Response(
      JSON.stringify({ error: 'Erro interno no servidor.', details: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
