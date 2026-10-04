// =========================================================================
// SUPABASE EDGE FUNCTION: checkout-api
// Runtime: Deno (100% Free no Supabase Edge Functions)
// =========================================================================

// Declaração de compatibilidade de tipos para compilação multiplataforma (Deno/Node)
declare const Deno: any;

// Configurações do Catálogo
export const CATALOG = {
  KIT_ID: 'kit-depilador-4em1',
  KIT_NAME: 'Kit Depilador 4 em 1 Landy Shaner',
  KIT_PRICE_CENTS: 3490, // R$ 34,90
  CREAM_ID: 'creme-clareador-clear-beauty',
  CREAM_NAME: 'Creme Clareador Íntimo e Corporal Clear Beauty',
  CREAM_PRICE_CENTS: 1500, // R$ 15,00
  CURRENCY: 'BRL',
};

export const VALID_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

export const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function isValidCPF(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(clean)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(clean.charAt(10), 10)) return false;

  return true;
}

export function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/\D/g, '');
  if (clean.length !== 10 && clean.length !== 11) return false;
  const ddd = parseInt(clean.substring(0, 2), 10);
  return ddd >= 11 && ddd <= 99;
}

export async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function calculateOrderAmounts(quantity: number, includeCream: boolean) {
  const safeQty = Math.max(1, Math.min(10, Math.floor(quantity || 1)));
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

export interface CheckoutHandlerDeps {
  supabaseClient?: any;
  sigilopayPublicKey?: string;
  sigilopaySecretKey?: string;
  sigilopayCallbackUrl?: string;
  sigilopayBaseUrl?: string;
  allowedOrigins?: string[];
  fetchFn?: typeof fetch;
}

/**
 * Cria a instância do handler HTTP de checkout (Deno / Supabase Edge Functions / Testes)
 */
export function createCheckoutHandler(deps: CheckoutHandlerDeps = {}) {
  const getEnv = (key: string) => {
    if (typeof Deno !== 'undefined' && Deno.env) {
      return Deno.env.get(key) || '';
    }
    return (process.env as any)?.[key] || '';
  };

  const SIGILOPAY_PUBLIC_KEY = deps.sigilopayPublicKey || getEnv('SIGILOPAY_PUBLIC_KEY');
  const SIGILOPAY_SECRET_KEY = deps.sigilopaySecretKey || getEnv('SIGILOPAY_SECRET_KEY');
  const SIGILOPAY_CALLBACK_URL = deps.sigilopayCallbackUrl || getEnv('SIGILOPAY_CALLBACK_URL');
  const SIGILOPAY_BASE_URL = deps.sigilopayBaseUrl || getEnv('SIGILOPAY_BASE_URL') || 'https://app.sigilopay.com.br/api/v1';
  const customOrigins = deps.allowedOrigins || (getEnv('ALLOWED_ORIGINS') ? getEnv('ALLOWED_ORIGINS').split(',').map((s: string) => s.trim()) : []);

  const ALLOWED_ORIGINS = [
    'https://landy-shaner.pages.dev',
    ...customOrigins,
  ];

  const fetchClient = deps.fetchFn || fetch;

  const getCorsHeaders = (req: Request): HeadersInit => {
    const origin = req.headers.get('Origin');
    if (!origin) {
      return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
        'Content-Type': 'application/json',
      };
    }

    const isAllowed = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.some((allowed) => allowed === origin || origin.endsWith('.pages.dev'));
    const allowOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

    return {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
      'Content-Type': 'application/json',
    };
  };

  return async (req: Request): Promise<Response> => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);
    let pathname = url.pathname.replace(/^\/functions\/v1/, '').replace(/^\/checkout-api/, '');
    if (!pathname.startsWith('/')) pathname = '/' + pathname;

    try {
      if (pathname === '/health' || pathname === '/') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'landy-shaner-edge-checkout',
            sigilopayConfigured: Boolean(SIGILOPAY_PUBLIC_KEY && SIGILOPAY_SECRET_KEY && SIGILOPAY_CALLBACK_URL),
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (pathname === '/create' && req.method === 'POST') {
        const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
        if (contentLength > 16384) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Corpo da requisição excede limite de 16KB.' } }),
            { status: 413, headers: corsHeaders }
          );
        }

        if (!SIGILOPAY_PUBLIC_KEY || !SIGILOPAY_SECRET_KEY || !SIGILOPAY_CALLBACK_URL) {
          return new Response(
            JSON.stringify({
              success: false,
              error: {
                errorCode: 'GATEWAY_NOT_CONFIGURED',
                message: 'Chaves da Sigilo Pay não configuradas no servidor.',
              },
            }),
            { status: 503, headers: corsHeaders }
          );
        }

        const body = await req.json().catch(() => ({}));
        const {
          idempotencyKey: rawIdemKey,
          clientGuestToken: rawGuestToken,
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

        if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100 || name.trim().split(' ').length < 2) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Nome completo obrigatório (nome e sobrenome, max 100 caracteres).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!email || typeof email !== 'string' || email.trim().length > 100 || !EMAIL_REGEX.test(email.trim())) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'E-mail obrigatório com formato válido.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanPhone = String(phone || '').replace(/\D/g, '');
        if (!isValidPhone(cleanPhone)) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Telefone com DDD válido obrigatório (10 ou 11 dígitos).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanCpf = String(document || '').replace(/\D/g, '');
        if (!isValidCPF(cleanCpf)) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'CPF inválido (dígitos verificadores incorretos).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanCep = String(postalCode || '').replace(/\D/g, '');
        if (cleanCep.length !== 8) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'CEP inválido (8 dígitos numéricos).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!street || typeof street !== 'string' || street.trim().length < 2 || street.trim().length > 120 ||
            !houseNumber || typeof houseNumber !== 'string' || houseNumber.trim().length < 1 || houseNumber.trim().length > 20 ||
            !district || typeof district !== 'string' || district.trim().length < 2 || district.trim().length > 60 ||
            !city || typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 60) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Endereço de entrega incompleto ou excede limites.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const cleanState = String(state || '').trim().toUpperCase();
        if (!VALID_UFS.has(cleanState)) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'UF inválida (deve ser um estado brasileiro válido).' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Quantidade deve ser um número inteiro entre 1 e 10.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (typeof includeCream !== 'boolean') {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Opção de clareador deve ser um booleano.' } }),
            { status: 400, headers: corsHeaders }
          );
        }

        const idempotencyKey = String(rawIdemKey || '').trim().slice(0, 128) || await sha256Hex(`idem_${cleanCpf}_${cleanPhone}_${quantity}_${includeCream}`);
        const clientGuestToken = String(rawGuestToken || '').trim().slice(0, 128) || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2));
        const guestTokenHash = await sha256Hex(clientGuestToken);

        const { amountCents, amountReais, items } = calculateOrderAmounts(quantity, includeCream);
        const randomSuffix = Math.floor(100000 + Math.random() * 900000);
        const newOrderId = `LS-${randomSuffix}`;
        const newIdentifier = `sig_${newOrderId.toLowerCase()}_${Date.now()}`;

        let sb = deps.supabaseClient;
        if (!sb && typeof Deno !== 'undefined') {
          const supabaseUrl = 'https://esm.sh/@supabase/supabase-js@2.39.8';
          const { createClient } = await import(/* @vite-ignore */ supabaseUrl);
          const sbUrl = Deno.env.get('SUPABASE_URL') || '';
          const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
          sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
        }

        if (!sb) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Configuração do Supabase indisponível no backend.' } }),
            { status: 500, headers: corsHeaders }
          );
        }

        const { data: orderAttempt, error: rpcError } = await sb.rpc(
          'rpc_create_or_get_pending_order',
          {
            p_idempotency_key: idempotencyKey,
            p_order_id: newOrderId,
            p_identifier: newIdentifier,
            p_customer_name: name.trim(),
            p_customer_email: email.trim().toLowerCase(),
            p_customer_phone: cleanPhone,
            p_customer_cpf: cleanCpf,
            p_postal_code: cleanCep,
            p_street: street.trim(),
            p_house_number: houseNumber.trim(),
            p_complement: complement ? String(complement).trim().slice(0, 60) : null,
            p_district: district.trim(),
            p_city: city.trim(),
            p_state: cleanState,
            p_quantity: quantity,
            p_include_cream: includeCream,
            p_total_price: amountReais,
            p_amount_cents: amountCents,
            p_guest_token_hash: guestTokenHash,
          }
        );

        if (rpcError) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Erro interno ao registrar pedido.' } }),
            { status: 500, headers: corsHeaders }
          );
        }

        const row = Array.isArray(orderAttempt) ? orderAttempt[0] : orderAttempt;

        if (row?.is_abusive) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Limite de tentativas excedido para este CPF. Tente mais tarde.' } }),
            { status: 429, headers: corsHeaders }
          );
        }

        if (row?.token_mismatch) {
          return new Response(
            JSON.stringify({ success: false, error: { message: 'Conflito de autenticação da sessão de compra.' } }),
            { status: 403, headers: corsHeaders }
          );
        }

        if (row?.existing) {
          if (row.status === 'creating') {
            return new Response(
              JSON.stringify({
                success: false,
                status: 'creating',
                error: { message: 'Cobrança em processamento preliminar. Aguarde alguns instantes.' },
              }),
              { status: 409, headers: corsHeaders }
            );
          }

          if (row.status === 'uncertain') {
            return new Response(
              JSON.stringify({
                success: false,
                status: 'uncertain',
                error: { message: 'Cobrança aguardando confirmação do gateway. Não tente recriar para evitar cobrança dupla.' },
              }),
              { status: 409, headers: corsHeaders }
            );
          }

          if (row.status === 'paid') {
            return new Response(
              JSON.stringify({
                success: true,
                orderId: row.order_id,
                guestToken: clientGuestToken,
                status: 'paid',
                totalPrice: Number(row.total_price),
              }),
              { status: 200, headers: corsHeaders }
            );
          }

          if (row.pix_code) {
            return new Response(
              JSON.stringify({
                success: true,
                orderId: row.order_id,
                guestToken: clientGuestToken,
                pixCode: row.pix_code,
                pixImage: row.pix_image || null,
                expiresAt: row.expires_at || null,
                totalPrice: Number(row.total_price),
                status: row.status,
              }),
              { status: 200, headers: corsHeaders }
            );
          }
        }

        const activeOrderId = row.order_id || newOrderId;
        const activeIdentifier = row.identifier || newIdentifier;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const sigiloRes = await fetchClient(`${SIGILOPAY_BASE_URL}/gateway/pix/receive`, {
            method: 'POST',
            headers: {
              'x-public-key': SIGILOPAY_PUBLIC_KEY,
              'x-secret-key': SIGILOPAY_SECRET_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              identifier: activeIdentifier,
              amount: amountReais,
              client: {
                name: name.trim(),
                email: email.trim().toLowerCase(),
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
            await sb.rpc('rpc_attach_sigilopay_charge', {
              p_order_id: activeOrderId,
              p_identifier: activeIdentifier,
              p_transaction_id: null,
              p_webhook_token: null,
              p_pix_code: null,
              p_pix_image: null,
              p_expires_at: null,
              p_gateway_status: 'FAILED',
              p_status: 'uncertain',
            });

            return new Response(
              JSON.stringify({
                success: false,
                error: {
                  statusCode: sigiloRes.status,
                  message: 'Não foi possível gerar a cobrança Pix no gateway.',
                },
              }),
              { status: sigiloRes.status >= 400 && sigiloRes.status < 600 ? sigiloRes.status : 502, headers: corsHeaders }
            );
          }

          const transactionId = String(sigiloJson.transactionId || sigiloJson.id || '').trim();
          const webhookToken = String(sigiloJson.webhookToken || sigiloJson.token || '').trim();
          const pixCode = String(sigiloJson.pix?.code || sigiloJson.pixCode || '').trim();
          const pixImage = sigiloJson.pix?.image ? String(sigiloJson.pix.image).trim() : null;
          const expiresAt = sigiloJson.pix?.expiresAt || sigiloJson.expiresAt || null;
          const gatewayStatus = sigiloJson.transactionStatus || sigiloJson.status || 'WAITING_PAYMENT';

          if (!transactionId || !webhookToken || !pixCode) {
            await sb.rpc('rpc_attach_sigilopay_charge', {
              p_order_id: activeOrderId,
              p_identifier: activeIdentifier,
              p_transaction_id: null,
              p_webhook_token: null,
              p_pix_code: null,
              p_pix_image: null,
              p_expires_at: null,
              p_gateway_status: 'INCOMPLETE_RESPONSE',
              p_status: 'uncertain',
            });

            return new Response(
              JSON.stringify({
                success: false,
                error: { message: 'A Sigilo Pay não retornou os dados completos da cobrança.' },
              }),
              { status: 502, headers: corsHeaders }
            );
          }

          const { data: attachOk, error: attachErr } = await sb.rpc('rpc_attach_sigilopay_charge', {
            p_order_id: activeOrderId,
            p_identifier: activeIdentifier,
            p_transaction_id: transactionId,
            p_webhook_token: webhookToken,
            p_pix_code: pixCode,
            p_pix_image: pixImage,
            p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            p_gateway_status: gatewayStatus,
            p_status: 'pending',
          });

          if (attachErr || !attachOk) {
            return new Response(
              JSON.stringify({
                success: false,
                error: { message: 'Falha de persistência ao salvar cobrança.' },
              }),
              { status: 500, headers: corsHeaders }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              orderId: activeOrderId,
              guestToken: clientGuestToken,
              pixCode,
              pixImage,
              expiresAt,
              totalPrice: amountReais,
              status: 'pending',
            }),
            { status: 200, headers: corsHeaders }
          );
        } catch {
          clearTimeout(timeoutId);
          await sb.rpc('rpc_attach_sigilopay_charge', {
            p_order_id: activeOrderId,
            p_identifier: activeIdentifier,
            p_transaction_id: null,
            p_webhook_token: null,
            p_pix_code: null,
            p_pix_image: null,
            p_expires_at: null,
            p_gateway_status: 'TIMEOUT',
            p_status: 'uncertain',
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: {
                errorCode: 'GATEWAY_TIMEOUT',
                message: 'Tempo esgotado ao contatar o gateway de pagamento. Cobrança registrada para reconciliação.',
              },
            }),
            { status: 504, headers: corsHeaders }
          );
        }
      }

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

        let sb = deps.supabaseClient;
        if (!sb && typeof Deno !== 'undefined') {
          const supabaseUrl = 'https://esm.sh/@supabase/supabase-js@2.39.8';
          const { createClient } = await import(/* @vite-ignore */ supabaseUrl);
          sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
        }

        const { data: order, error } = await sb
          .from('orders')
          .select('order_id, status, paid_at, total_price, quantity, include_cream, pix_code, pix_image, expires_at, guest_token_hash')
          .eq('order_id', orderId)
          .maybeSingle();

        if (error || !order) {
          return new Response(
            JSON.stringify({ success: false, error: 'Pedido não localizado.' }),
            { status: 404, headers: corsHeaders }
          );
        }

        if (!timingSafeEqualStr(order.guest_token_hash || '', inputHash)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Acesso não autorizado para este pedido.' }),
            { status: 403, headers: corsHeaders }
          );
        }

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
            expiresAt: order.expires_at || null,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      if (pathname === '/webhook' && req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const { event, token, transaction } = body;

        if (!token || !transaction || typeof transaction !== 'object') {
          return new Response(
            JSON.stringify({ error: 'Payload inválido: token e transaction são obrigatórios.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        const transactionId = String(transaction.id || '').trim();
        const identifier = String(transaction.identifier || '').trim();

        if (!transactionId || !identifier) {
          return new Response(
            JSON.stringify({ error: 'Identificadores transaction.id e identifier são obrigatórios.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        let sb = deps.supabaseClient;
        if (!sb && typeof Deno !== 'undefined') {
          const supabaseUrl = 'https://esm.sh/@supabase/supabase-js@2.39.8';
          const { createClient } = await import(/* @vite-ignore */ supabaseUrl);
          sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
        }

        const { data: order, error: orderErr } = await sb
          .from('orders')
          .select('*')
          .eq('transaction_id', transactionId)
          .maybeSingle();

        if (orderErr || !order) {
          return new Response(
            JSON.stringify({ error: 'Pedido associado ao transaction_id não localizado.' }),
            { status: 404, headers: corsHeaders }
          );
        }

        if (order.identifier !== identifier) {
          return new Response(
            JSON.stringify({ error: 'Inconsistência entre transaction.id e identifier da cobrança.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (!order.webhook_token) {
          return new Response(
            JSON.stringify({ error: 'Cobrança em persistência. Tente novamente em instantes.' }),
            { status: 503, headers: { ...corsHeaders, 'Retry-After': '3' } }
          );
        }

        if (!timingSafeEqualStr(order.webhook_token, String(token))) {
          return new Response(
            JSON.stringify({ error: 'Token de autenticação do webhook inválido.' }),
            { status: 401, headers: corsHeaders }
          );
        }

        if (order.status === 'paid' && (event === 'TRANSACTION_PAID' || transaction.status === 'COMPLETED')) {
          return new Response(
            JSON.stringify({ received: true, status: 'already_paid' }),
            { status: 200, headers: corsHeaders }
          );
        }

        const isStrictPaid =
          event === 'TRANSACTION_PAID' &&
          transaction.status === 'COMPLETED' &&
          transaction.paymentMethod === 'PIX';

        if (isStrictPaid) {
          if (String(transaction.currency || '').toUpperCase() !== 'BRL') {
            return new Response(
              JSON.stringify({ error: 'Moeda da transação inválida: esperado BRL.' }),
              { status: 400, headers: corsHeaders }
            );
          }

          const receivedCents = Math.round(Number(transaction.amount) * 100);
          if (receivedCents !== order.amount_cents) {
            return new Response(
              JSON.stringify({ error: 'Valor da transação não confere com o pedido.' }),
              { status: 400, headers: corsHeaders }
            );
          }

          const { data: confirmRes, error: confirmErr } = await sb.rpc(
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

          const confirmRow = Array.isArray(confirmRes) ? confirmRes[0] : confirmRes;
          if (confirmRow && !confirmRow.success) {
            return new Response(
              JSON.stringify({ error: confirmRow.action || 'Transição de pagamento não permitida.' }),
              { status: 400, headers: corsHeaders }
            );
          }

          return new Response(
            JSON.stringify({ received: true, status: 'paid_confirmed' }),
            { status: 200, headers: corsHeaders }
          );
        }

        if (event === 'TRANSACTION_PAID') {
          return new Response(
            JSON.stringify({ error: 'Evento de pagamento não atende aos critérios estritos.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        if (event === 'TRANSACTION_CANCELED' || transaction.status === 'CANCELED') {
          const { data: cancelRes, error: cancelErr } = await sb.rpc('rpc_update_order_cancellation', {
            p_transaction_id: transactionId,
            p_identifier: identifier,
            p_new_status: 'canceled',
            p_gateway_status: 'CANCELED',
          });

          if (cancelErr) {
            return new Response(JSON.stringify({ error: 'Erro ao cancelar pedido.' }), { status: 500, headers: corsHeaders });
          }

          const cancelRow = Array.isArray(cancelRes) ? cancelRes[0] : cancelRes;
          if (cancelRow && !cancelRow.success) {
            return new Response(JSON.stringify({ error: cancelRow.action || 'Cancelamento rejeitado.' }), { status: 400, headers: corsHeaders });
          }

          return new Response(JSON.stringify({ received: true, status: 'canceled' }), { status: 200, headers: corsHeaders });
        }

        if (event === 'TRANSACTION_REFUNDED' || transaction.status === 'REFUNDED') {
          await sb.rpc('rpc_update_order_cancellation', {
            p_transaction_id: transactionId,
            p_identifier: identifier,
            p_new_status: 'refunded',
            p_gateway_status: 'REFUNDED',
          });
          return new Response(JSON.stringify({ received: true, status: 'refunded' }), { status: 200, headers: corsHeaders });
        }

        if (event === 'TRANSACTION_CHARGED_BACK' || transaction.status === 'CHARGED_BACK') {
          await sb.rpc('rpc_update_order_cancellation', {
            p_transaction_id: transactionId,
            p_identifier: identifier,
            p_new_status: 'charged_back',
            p_gateway_status: 'CHARGED_BACK',
          });
          return new Response(JSON.stringify({ received: true, status: 'charged_back' }), { status: 200, headers: corsHeaders });
        }

        return new Response(
          JSON.stringify({ received: true, status: 'acknowledged' }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Rota não encontrada.' }),
        { status: 404, headers: corsHeaders }
      );
    } catch {
      return new Response(
        JSON.stringify({ error: 'Erro interno ao processar requisição.' }),
        { status: 500, headers: corsHeaders }
      );
    }
  };
}

// Inicialização automática apenas se executado diretamente pelo Deno / Supabase
if (typeof Deno !== 'undefined' && (import.meta as any).main) {
  const supabaseUrl = 'https://deno.land/std@0.177.0/http/server.ts';
  const { serve } = await import(/* @vite-ignore */ supabaseUrl);
  const handler = createCheckoutHandler();
  serve(handler);
}
