import assert from 'assert';
import {
  createCheckoutHandler,
  isValidCPF,
  isValidPhone,
  calculateOrderAmounts,
  sha256Hex,
} from '../supabase/functions/checkout-api/index';

async function runEdgeFunctionTests() {
  console.log('🧪 Iniciando Bateria Estrita de Testes do Handler da Edge Function (checkout-api)\n');
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

  const dbOrders = new Map<string, any>();
  const dbCpfAttempts = new Map<string, number[]>();
  let forceAttachFailure = false;
  let forceRefundRpcError = false;

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
            if (ord.payload_hash && ord.payload_hash !== args.p_payload_hash) {
              return { data: [{ payload_mismatch: true }], error: null };
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
          payload_hash: args.p_payload_hash,
          created_at: new Date().toISOString(),
        };
        dbOrders.set(newOrd.order_id, newOrd);
        return { data: [{ existing: false, order_id: newOrd.order_id, identifier: newOrd.identifier }], error: null };
      }

      if (fnName === 'rpc_attach_sigilopay_charge') {
        if (forceAttachFailure) {
          return { data: false, error: new Error('Simulated DB persistence failure') };
        }
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
        if (forceRefundRpcError) {
          return { data: null, error: new Error('Simulated RPC refund error') };
        }
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

      return { data: null, error: new Error('RPC desconhecida') };
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

  let gatewaySimulateFailed = false;

  const mockGatewayFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = String(input);
    if (urlStr.includes('/gateway/pix/receive')) {
      if (gatewaySimulateFailed) {
        return new Response(
          JSON.stringify({ status: 'FAILED', success: false, message: 'Recusado pelo antifraude' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          transactionId: `tx_${Date.now()}`,
          status: 'OK',
          success: true,
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

  const validPayload = {
    idempotencyKey: 'intent_12345678901234567890123456789012',
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

  // ------------------------------------------------------------------------
  // 1. CORS ATTACKER TEST
  // ------------------------------------------------------------------------
  console.log('🛡️ 1. Teste de Segurança CORS');

  await test('CORS Attacker: Origin https://attacker.pages.dev deve ser rejeitada com 403', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://attacker.pages.dev',
      },
      body: JSON.stringify(validPayload),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 403);
  });

  // ------------------------------------------------------------------------
  // 2. BODY SIZE BYTE LENGTH (SEM CONTENT-LENGTH)
  // ------------------------------------------------------------------------
  console.log('\n📦 2. Teste de Limite de Payload (byteLength real)');

  await test('Payload maior que 16KB mesmo sem Content-Length deve retornar 413', async () => {
    const oversized = { ...validPayload, street: 'A'.repeat(20000) };
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(oversized),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 413);
  });

  // ------------------------------------------------------------------------
  // 3. CRIAÇÃO DE COBRANÇA E RESPOSTA GATEWAY COM STATUS FAILED
  // ------------------------------------------------------------------------
  console.log('\n💳 3. Respostas do Gateway e Falhas de Persistência');

  await test('Gateway retornando 200 mas com status FAILED é tratado como falha (502)', async () => {
    gatewaySimulateFailed = true;
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, idempotencyKey: 'intent_failed_200_1234567890123456' }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 502);
    gatewaySimulateFailed = false;
  });

  await test('Falha de persistência no RPC attach aborta resposta de sucesso com 500', async () => {
    forceAttachFailure = true;
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, idempotencyKey: 'intent_attach_fail_1234567890123456' }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 500);
    forceAttachFailure = false;
  });

  // ------------------------------------------------------------------------
  // 4. CRIAÇÃO VÁLIDA E PEDIDO EXISTENTE SEM PIX CODE
  // ------------------------------------------------------------------------
  console.log('\n🔄 4. Reuso de Pedidos Existentes e Status Incompletos');

  let orderId = '';
  await test('Criação bem-sucedida gera cobrança e retorna 200', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    orderId = data.orderId;
  });

  await test('Pedido existente com status uncertain ou sem pix_code retorna 409 e não chama gateway', async () => {
    const uncertainKey = 'intent_uncertain_1234567890123456';
    dbOrders.set('LS-UNCERTAIN-1', {
      order_id: 'LS-UNCERTAIN-1',
      identifier: 'sig_unc_1',
      idempotency_key: uncertainKey,
      customer_cpf: validPayload.document,
      guest_token_hash: await sha256Hex(validPayload.clientGuestToken),
      payload_hash: '',
      status: 'uncertain',
      pix_code: null,
    });

    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validPayload, idempotencyKey: uncertainKey }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.status, 'uncertain');
  });

  // ------------------------------------------------------------------------
  // 5. TESTES NEGATIVOS DE WEBHOOK
  // ------------------------------------------------------------------------
  console.log('\n⚡ 5. Webhook: Early Duplicate com Valor Errado, IDs e Erros RPC');

  const orderRecord = dbOrders.get(orderId);
  const txId = orderRecord.transaction_id;
  const ident = orderRecord.identifier;
  const token = orderRecord.webhook_token;

  // Primeiro paga com sucesso
  await test('Confirmação legítima de pagamento marca pedido como PAGO', async () => {
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
    assert.strictEqual(orderRecord.status, 'paid');
  });

  await test('Early Duplicate com valor divergente deve retornar 400 (sem bypass)', async () => {
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
          amount: 10.0, // Valor errado
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400); // Não pode dar 200 bypass!
  });

  await test('Tentativa de cancelamento com identifier incorreto retorna 400', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_CANCELED',
        token,
        transaction: {
          id: txId,
          identifier: 'sig_identifier_falso',
          status: 'CANCELED',
          paymentMethod: 'PIX',
          currency: 'BRL',
          amount: 49.9,
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Erro retornado pelo RPC de estorno responde 500 no webhook', async () => {
    forceRefundRpcError = true;
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_REFUNDED',
        token,
        transaction: {
          id: txId,
          identifier: ident,
          status: 'REFUNDED',
          paymentMethod: 'PIX',
          currency: 'BRL',
          amount: 49.9,
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 500);
    forceRefundRpcError = false;
  });

  // ------------------------------------------------------------------------
  // 6. TESTES ADICIONAIS EXIGIDOS
  // ------------------------------------------------------------------------
  console.log('\n🔒 6. Testes Adicionais: Reuso Pending, Identificadores e Transições Proibidas');

  await test('Webhook sem identifier é recusado com 400', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token,
        transaction: {
          id: txId,
          status: 'COMPLETED',
          paymentMethod: 'PIX',
          currency: 'BRL',
          amount: 49.9,
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Webhook sem transactionId é recusado com 400', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token,
        transaction: {
          identifier: ident,
          status: 'COMPLETED',
          paymentMethod: 'PIX',
          currency: 'BRL',
          amount: 49.9,
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Reuso de pedido pending com guestToken correto preserva acesso sem novo Pix', async () => {
    const reusePayload = {
      ...validPayload,
      idempotencyKey: 'intent_reuse_pending_12345678901234',
      clientGuestToken: 'client_guest_reuse_1234567890123456',
    };

    // Criação inicial
    const req1 = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reusePayload),
    });
    const res1 = await handler(req1);
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.status, 'pending');

    // Segunda chamada na mesma sessão
    const req2 = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reusePayload),
    });
    const res2 = await handler(req2);
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.orderId, data1.orderId);
    assert.strictEqual(data2.guestToken, reusePayload.clientGuestToken);

    // Consulta de status com o guestToken correto
    const reqStatus = new Request(`https://ojvznzupiojimykqryhw.supabase.co/status?orderId=${data2.orderId}&token=${reusePayload.clientGuestToken}`, {
      method: 'GET',
    });
    const resStatus = await handler(reqStatus);
    assert.strictEqual(resStatus.status, 200);
  });

  await test('Webhook com PAID e status WAITING_PAYMENT é recusado com 400 (strict AND)', async () => {
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'TRANSACTION_PAID',
        token,
        transaction: {
          id: txId,
          identifier: ident,
          status: 'WAITING_PAYMENT', // Divergente
          paymentMethod: 'PIX',
          currency: 'BRL',
          amount: 49.9,
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Webhook duplicado com método errado (CREDIT_CARD) é recusado com 400', async () => {
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
          paymentMethod: 'CREDIT_CARD',
          currency: 'BRL',
          amount: 49.9,
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Webhook duplicado com moeda errada (USD) é recusado com 400', async () => {
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
          currency: 'USD',
          amount: 49.9,
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
  });

  await test('Pedido no estado terminal REFUNDED recebendo PAID é recusado com 400', async () => {
    // Registra estorno no pedido de teste
    orderRecord.status = 'refunded';

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
        },
      }),
    });
    const res = await handler(req);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(orderRecord.status, 'refunded'); // Não reverteu
  });

  await test('Falta de credenciais no servidor aborta com 503 ANTES de criar registro no banco', async () => {
    const unconfigured = createCheckoutHandler({
      supabaseClient: mockSupabase,
      sigilopayPublicKey: '',
      sigilopaySecretKey: '',
    });

    const ordersCountBefore = dbOrders.size;
    const req = new Request('https://ojvznzupiojimykqryhw.supabase.co/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validPayload,
        idempotencyKey: 'intent_nocreds_123456789012345678',
      }),
    });
    const res = await unconfigured(req);
    assert.strictEqual(res.status, 503);
    assert.strictEqual(dbOrders.size, ordersCountBefore); // Nenhum pedido inserido no banco!
  });

  console.log(`\n======================================================`);
  console.log(`🎯 RESULTADO DOS TESTES NEGATIVOS: ${passed} Aprovados, ${failed} Falhas`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runEdgeFunctionTests().catch((err) => {
  console.error('Falha fatal na execução dos testes:', err);
  process.exit(1);
});
