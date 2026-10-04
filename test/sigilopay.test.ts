import assert from 'assert';
import {
  createCheckoutHandler,
  isValidCPF,
  isValidPhone,
  calculateOrderAmounts,
  sha256Hex,
} from '../supabase/functions/checkout-api/index';

async function runEdgeFunctionTests() {
  console.log('🧪 Iniciando Bateria de Testes do Handler Oficial da Edge Function (checkout-api)\n');
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}:`, err.message);
      failed++;
    }
  }

  // Database Mock Adapter que simula exatamente o comportamento dos RPCs SQL do Supabase
  const dbOrders = new Map<string, any>();
  const dbCpfAttempts = new Map<string, number[]>();

  const mockSupabase = {
    rpc: async (fnName: string, args: any) => {
      if (fnName === 'rpc_create_or_get_pending_order') {
        const cpf = args.p_customer_cpf;
        const now = Date.now();
        const attempts = (dbCpfAttempts.get(cpf) || []).filter((t) => now - t < 3600000);
        if (attempts.length >= 15) {
          return { data: [{ is_abusive: true }], error: null };
        }
        attempts.push(now);
        dbCpfAttempts.set(cpf, attempts);

        for (const ord of dbOrders.values()) {
          if (ord.idempotency_key === args.p_idempotency_key) {
            if (ord.guest_token_hash !== args.p_guest_token_hash) {
              return { data: [{ token_mismatch: true }], error: null };
            }
            return {
              data: [
                {
                  existing: true,
                  order_id: ord.order_id,
                  identifier: ord.identifier,
                  status: ord.status,
                  pix_code: ord.pix_code,
                  pix_image: ord.pix_image,
                  expires_at: ord.expires_at,
                  total_price: ord.total_price,
                },
              ],
              error: null,
            };
          }
        }

        const newOrd = {
          order_id: args.p_order_id,
          identifier: args.p_identifier,
          idempotency_key: args.p_idempotency_key,
          customer_name: args.p_customer_name,
          customer_email: args.p_customer_email,
          customer_phone: args.p_customer_phone,
          customer_cpf: args.p_customer_cpf,
          quantity: args.p_quantity,
          include_cream: args.p_include_cream,
          total_price: args.p_total_price,
          amount_cents: args.p_amount_cents,
          status: 'creating',
          guest_token_hash: args.p_guest_token_hash,
          created_at: new Date().toISOString(),
        };
        dbOrders.set(newOrd.order_id, newOrd);
        return { data: [{ existing: false, order_id: newOrd.order_id, identifier: newOrd.identifier }], error: null };
      }

      if (fnName === 'rpc_attach_sigilopay_charge') {
        const ord = dbOrders.get(args.p_order_id);
        if (!ord) return { data: false, error: null };
        ord.identifier = args.p_identifier;
        ord.transaction_id = args.p_transaction_id;
        ord.webhook_token = args.p_webhook_token;
        ord.pix_code = args.p_pix_code;
        ord.pix_image = args.p_pix_image;
        ord.expires_at = args.p_expires_at;
        ord.gateway_status = args.p_gateway_status;
        ord.status = args.p_status;
        return { data: true, error: null };
      }

      if (fnName === 'rpc_confirm_sigilopay_payment') {
        let ord: any = null;
        for (const o of dbOrders.values()) {
          if (o.transaction_id === args.p_transaction_id && o.identifier === args.p_identifier) {
            ord = o;
            break;
          }
        }
        if (!ord) return { data: [{ success: false, action: 'ORDER_NOT_FOUND' }], error: null };
        if (['refunded', 'charged_back'].includes(ord.status)) {
          return { data: [{ success: false, action: 'TERMINAL_STATE_CANNOT_REVERT' }], error: null };
        }
        if (ord.status === 'paid') {
          return { data: [{ success: true, action: 'ALREADY_PAID', order_id: ord.order_id }], error: null };
        }
        ord.status = 'paid';
        ord.paid_at = args.p_payed_at;
        ord.gateway_status = 'COMPLETED';
        return { data: [{ success: true, action: 'PAYMENT_CONFIRMED', order_id: ord.order_id }], error: null };
      }

      if (fnName === 'rpc_update_order_cancellation') {
        let ord: any = null;
        for (const o of dbOrders.values()) {
          if (o.transaction_id === args.p_transaction_id && o.identifier === args.p_identifier) {
            ord = o;
            break;
          }
        }
        if (!ord) return { data: [{ success: false, action: 'ORDER_NOT_FOUND' }], error: null };
        if (ord.status === 'paid' && args.p_new_status === 'canceled') {
          return { data: [{ success: false, action: 'PAID_CANNOT_BE_CANCELED' }], error: null };
        }
        ord.status = args.p_new_status;
        ord.gateway_status = args.p_gateway_status;
        return { data: [{ success: true, action: 'STATUS_UPDATED', order_id: ord.order_id }], error: null };
      }

      return { data: null, error: new Error('RPC não implementada no mock') };
    },
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === 'orders') {
              for (const ord of dbOrders.values()) {
                if (ord[col] === val) return { data: ord, error: null };
              }
            }
            return { data: null, error: null };
          },
        }),
      }),
    }),
  };

  const mockGatewayFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('/gateway/pix/receive')) {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.client?.name === 'Force Timeout') {
        throw new Error('AbortError: Gateway timeout');
      }
      return new Response(
        JSON.stringify({
          transactionId: `tx_${Date.now()}`,
          status: 'OK',
          transactionStatus: 'WAITING_PAYMENT',
          webhookToken: `wh_tok_${Date.now()}`,
          pix: {
            code: '00020126...code_pix_oficial...',
            image: 'https://app.sigilopay.com.br/qr.png',
            expiresAt: new Date(Date.now() + 1800000).toISOString(),
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not Found', { status: 404 });
  };

  const handler = createCheckoutHandler({
    supabaseClient: mockSupabase,
    sigilopayPublicKey: 'pk_test_sigilopay',
    sigilopaySecretKey: 'sk_test_sigilopay',
    sigilopayCallbackUrl: 'https://ojvznzupiojimykqryhw.supabase.co/functions/v1/checkout-api/webhook',
    fetchFn: mockGatewayFetch,
  });

  // ------------------------------------------------------------------------
  // 1. NORMALIZAÇÃO DE PATHS E HEALTH CHECK
  // ------------------------------------------------------------------------
  console.log('🌐 1. Normalização de Paths e Health Check');

  await test('GET /functions/v1/checkout-api/health deve responder 200 OK', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/functions/v1/checkout-api/health', { method: 'GET' });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
  });

  await test('GET /checkout-api/health deve responder 200 OK', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/checkout-api/health', { method: 'GET' });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
  });

  await test('GET /health deve responder 200 OK', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/health', { method: 'GET' });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
  });

  // ------------------------------------------------------------------------
  // 2. VALIDAÇÃO DE ENTRADA E CHECKSUM CPF
  // ------------------------------------------------------------------------
  console.log('\n🔍 2. Validação Estrita de Dados (Email, CPF, Quantidade, UF)');

  const validPayload = {
    idempotencyKey: 'intent_1234567890123456',
    clientGuestToken: 'client_guest_token_123456789012345678901234',
    name: 'Ana Maria Silva',
    email: 'ana.maria@exemplo.com',
    phone: '11987654321',
    document: '11144477735', // CPF válido real
    postalCode: '01310100',
    street: 'Avenida Paulista',
    houseNumber: '1000',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    quantity: 1,
    includeCream: true,
  };

  await test('Requisição sem e-mail deve ser recusada com 400', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, email: '' }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Requisição com CPF com checksum inválido deve ser recusada com 400', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, document: '12345678900' }), // CPF inválido
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Requisição com CPF com 11 dígitos iguais (11111111111) deve ser recusada com 400', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, document: '11111111111' }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Requisição com quantidade zero ou maior que 10 deve ser recusada com 400', async () => {
    const req0 = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, quantity: 0 }),
    });
    const res0 = await handler(req0);
    assert.strictEqual(res0.status, 400);

    const req11 = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, quantity: 11 }),
    });
    const res11 = await handler(req11);
    assert.strictEqual(res11.status, 400);
  });

  await test('Requisição com UF inexistente deve ser recusada com 400', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, state: 'XX' }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Ausência de chaves Sigilo Pay deve abortar com 503 antes de tocar no banco', async () => {
    const unconfiguredHandler = createCheckoutHandler({
      supabaseClient: mockSupabase,
      sigilopayPublicKey: '',
      sigilopaySecretKey: '',
    });
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    const res = await unconfiguredHandler(req);
    assert.strictEqual(res.status, 503);
  });

  // ------------------------------------------------------------------------
  // 3. FLUXO REAL DE CRIAÇÃO, PERSISTÊNCIA E IDEMPOTÊNCIA
  // ------------------------------------------------------------------------
  console.log('\n💳 3. Criação de Cobrança e Idempotência Estável');

  let createdOrderId = '';
  let createdGuestToken = validPayload.clientGuestToken;

  await test('Criação com dados válidos retorna Pix com expiresAt e orderId', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert(data.orderId.startsWith('LS-'));
    assert(data.pixCode.length > 10);
    assert(data.expiresAt !== null);
    createdOrderId = data.orderId;
  });

  await test('Segunda chamada simultânea com mesma chave de idempotência reutiliza cobrança sem novo Pix', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.orderId, createdOrderId);
    assert.strictEqual(data.guestToken, createdGuestToken);
  });

  await test('Consulta /status com o guestToken correto retorna pedido e não falha com 403', async () => {
    const req = new Request(`https://ojvznzupiojimykqryhw.supabase.co/status?orderId=${createdOrderId}&token=${createdGuestToken}`, {
      method: 'GET',
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.orderId, createdOrderId);
    assert.strictEqual(data.status, 'pending');
    assert.strictEqual('customer_cpf' in data, false);
  });

  await test('Consulta /status com token errado retorna 403 Forbidden', async () => {
    const req = new Request(`https://ojvznzupiojimykqryhw.supabase.co/status?orderId=${createdOrderId}&token=token_falsificado`, {
      method: 'GET',
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 403);
  });

  // ------------------------------------------------------------------------
  // 4. TESTES DE WEBHOOK (STRICT AND, RACE CONDITIONS, RETROCESSO)
  // ------------------------------------------------------------------------
  console.log('\n⚡ 4. Webhook Oficial: Validação Estrita, Corrida e Estados Terminais');

  const orderRecord = dbOrders.get(createdOrderId);
  const txId = orderRecord.transaction_id;
  const ident = orderRecord.identifier;
  const token = orderRecord.webhook_token;

  await test('Webhook antes da persistência do webhook_token responde 503 com Retry-After', async () => {
    const tempOrder = {
      order_id: 'LS-TEMP-RACE',
      identifier: 'sig_temp_race',
      transaction_id: 'tx_race_1',
      webhook_token: null, // Ainda não gravou o token
      status: 'creating',
    };
    dbOrders.set('LS-TEMP-RACE', tempOrder);

    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token: 'any_token',
        transaction: { id: 'tx_race_1', identifier: 'sig_temp_race' },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.headers.get('Retry-After'), '3');
  });

  await test('Webhook com token incorreto retorna 401 Unauthorized', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token: 'TOKEN_INCORRETO',
        transaction: { id: txId, identifier: ident, status: 'COMPLETED', paymentMethod: 'PIX', currency: 'BRL', amount: 49.9 },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 401);
  });

  await test('Webhook com valor divergente retorna 400 Bad Request', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token,
        transaction: { id: txId, identifier: ident, status: 'COMPLETED', paymentMethod: 'PIX', currency: 'BRL', amount: 10.0 }, // 10.0 vs 49.9
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Webhook válido com todos os critérios estritos confirma pagamento 200 OK', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token,
        transaction: {
          id: txId,
          identifier: ident,
          status: 'COMPLETED',
          paymentMethod: 'PIX',
          currency: 'BRL',
          amount: 49.9,
          payedAt: new Date().toISOString(),
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'paid_confirmed');
    assert.strictEqual(orderRecord.status, 'paid');
  });

  await test('Webhook duplicado retorna 200 already_paid de forma idempotente', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token,
        transaction: { id: txId, identifier: ident, status: 'COMPLETED', paymentMethod: 'PIX', currency: 'BRL', amount: 49.9 },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'already_paid');
  });

  await test('Tentativa de cancelar pedido já pago via TRANSACTION_CANCELED é recusada', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_CANCELED',
        token,
        transaction: { id: txId, identifier: ident, status: 'CANCELED' },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(orderRecord.status, 'paid'); // Permanece PAID!
  });

  await test('Estorno via TRANSACTION_REFUNDED atualiza status para refunded', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_REFUNDED',
        token,
        transaction: { id: txId, identifier: ident, status: 'REFUNDED' },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(orderRecord.status, 'refunded');
  });

  await test('Evento TRANSACTION_PAID tardio após REFUNDED é recusado e não volta para paid', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token,
        transaction: { id: txId, identifier: ident, status: 'COMPLETED', paymentMethod: 'PIX', currency: 'BRL', amount: 49.9 },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(orderRecord.status, 'refunded'); // Mantém REFUNDED!
  });

  console.log(`\n======================================================`);
  console.log(`🎯 RESULTADO DOS TESTES DO HANDLER REAL: ${passed} Aprovados, ${failed} Falhas`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runEdgeFunctionTests().catch((err) => {
  console.error('Falha fatal na execução dos testes:', err);
  process.exit(1);
});
