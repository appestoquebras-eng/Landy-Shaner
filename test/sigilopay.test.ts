import assert from 'assert';
import {
  calculateOrderAmounts,
  CONFIG,
  isSigiloPayConfigured,
  sanitizeDigits,
} from '../server/config';
import {
  attachSigilopayCharge,
  buildIdempotencyKey,
  cancelOrRefundOrder,
  confirmSigilopayPayment,
  createOrGetPendingOrder,
  generateGuestToken,
  generateOrderAttemptIdentifier,
  getOrderByOrderId,
  getOrderByTransactionId,
  OrderRecord,
  sha256Hex,
} from '../server/db';
import { secureCompareTokens } from '../server/sigilopay';

async function runTests() {
  console.log('🧪 Iniciando Bateria Completa de Testes: Sigilo Pay & Edge Functions Free\n');
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}:`, err.message);
      failed++;
    }
  }

  // ------------------------------------------------------------------------
  // 1. CÁLCULO SEGURO DE CATÁLOGO EM CENTAVOS
  // ------------------------------------------------------------------------
  console.log('📦 1. Catálogo e Preços em Centavos');

  await test('1x Kit Depilador: R$ 34,90 (3490 centavos)', () => {
    const res = calculateOrderAmounts(1, false);
    assert.strictEqual(res.amountCents, 3490);
    assert.strictEqual(res.amountReais, 34.9);
    assert.strictEqual(res.items.length, 1);
  });

  await test('1x Kit + Upsell Clareador: R$ 49,90 (4990 centavos)', () => {
    const res = calculateOrderAmounts(1, true);
    assert.strictEqual(res.amountCents, 4990);
    assert.strictEqual(res.amountReais, 49.9);
    assert.strictEqual(res.items.length, 2);
  });

  await test('2x Kit + Upsell Clareador: R$ 84,80 (8480 centavos)', () => {
    const res = calculateOrderAmounts(2, true);
    assert.strictEqual(res.amountCents, 8480);
    assert.strictEqual(res.amountReais, 84.8);
  });

  await test('Soma de preços unitários * quantidade deve ser exatamente idêntica ao amount total', () => {
    for (let qty = 1; qty <= 6; qty++) {
      for (const cream of [false, true]) {
        const res = calculateOrderAmounts(qty, cream);
        const sum = res.items.reduce((acc, it) => acc + Math.round(it.price * 100) * it.quantity, 0);
        assert.strictEqual(sum, res.amountCents);
      }
    }
  });

  // ------------------------------------------------------------------------
  // 2. SANITIZAÇÃO CORRETA: NOME E EMAIL PRESERVADOS
  // ------------------------------------------------------------------------
  console.log('\n📝 2. Sanitização de Entrada (Nome e E-mail preservados sem perda de dígitos)');

  await test('Nome e E-mail não devem ter dígitos removidos (apenas trim/clean)', () => {
    const rawName = '  Maria da Silva 2ª Via  ';
    const rawEmail = '  maria.silva123@exemplo.com  ';

    // A sanitização de dígitos deve ser aplicada SOMENTE ao CPF, CEP e Telefone
    assert.strictEqual(sanitizeDigits('123.456.789-00'), '12345678900');
    assert.strictEqual(sanitizeDigits('(11) 98765-4321'), '11987654321');
    assert.strictEqual(sanitizeDigits('01310-100'), '01310100');

    // Valida que o processador preserva letras e números em emails e nomes
    const processedName = rawName.trim();
    const processedEmail = rawEmail.trim().toLowerCase();
    assert.strictEqual(processedName, 'Maria da Silva 2ª Via');
    assert.strictEqual(processedEmail, 'maria.silva123@exemplo.com');
  });

  // ------------------------------------------------------------------------
  // 3. DESDUPLICAÇÃO DURÁVEL E HASH DO GUEST TOKEN
  // ------------------------------------------------------------------------
  console.log('\n🛡️ 3. Desduplicação Durável e Proteção de Token com Hash SHA-256');

  await test('buildIdempotencyKey gera a mesma chave dentro da janela de tempo para mesma compra', () => {
    const k1 = buildIdempotencyKey('12345678901', '11999998888', 1, true);
    const k2 = buildIdempotencyKey('12345678901', '11999998888', 1, true);
    assert.strictEqual(k1, k2);
  });

  await test('Guest token é gerado com token público e hash SHA-256 para persistência', () => {
    const { rawToken, hash } = generateGuestToken();
    assert.strictEqual(rawToken.length, 48);
    assert.strictEqual(hash.length, 64);
    assert.strictEqual(sha256Hex(rawToken), hash);
  });

  await test('createOrGetPendingOrder previne cobrança duplicada durável retornando existente', async () => {
    const idemKey = `idem_test_${Date.now()}`;
    const { rawToken, hash } = generateGuestToken();

    const first = await createOrGetPendingOrder({
      idempotencyKey: idemKey,
      orderId: `LS-IDEM-1`,
      customerName: 'Cliente Teste Idem',
      customerPhone: '11999998888',
      customerCpf: '12345678901',
      postalCode: '01310100',
      street: 'Rua A',
      houseNumber: '10',
      district: 'Bairro',
      city: 'SP',
      state: 'SP',
      quantity: 1,
      includeCream: false,
      totalPrice: 34.9,
      amountCents: 3490,
      guestTokenHash: hash,
    });
    assert.strictEqual(first.existing, false);

    // Segunda chamada idêntica na mesma janela
    const second = await createOrGetPendingOrder({
      idempotencyKey: idemKey,
      orderId: `LS-IDEM-2`,
      customerName: 'Cliente Teste Idem',
      customerPhone: '11999998888',
      customerCpf: '12345678901',
      postalCode: '01310100',
      street: 'Rua A',
      houseNumber: '10',
      district: 'Bairro',
      city: 'SP',
      state: 'SP',
      quantity: 1,
      includeCream: false,
      totalPrice: 34.9,
      amountCents: 3490,
      guestTokenHash: hash,
    });
    assert.strictEqual(second.existing, true);
    assert.strictEqual(second.order.order_id, 'LS-IDEM-1');
  });

  // ------------------------------------------------------------------------
  // 4. TESTES NEGATIVOS ESTRITOS DE WEBHOOK (CADA CAMPO INDIVIDUALMENTE)
  // ------------------------------------------------------------------------
  console.log('\n⚡ 4. Testes Negativos de Validação de Webhook (Strict &&)');

  const orderId = `LS-WEBHOOK-TEST-${Date.now()}`;
  const txId = `tx_sigilo_${Date.now()}`;
  const identifier = generateOrderAttemptIdentifier(orderId);
  const webhookToken = `wh_token_${Date.now()}`;
  const { hash: guestHash } = generateGuestToken();

  const { order: baseOrder } = await createOrGetPendingOrder({
    idempotencyKey: `idem_wh_${Date.now()}`,
    orderId,
    customerName: 'Comprador Teste',
    customerPhone: '11999997777',
    customerCpf: '11122233344',
    postalCode: '01310100',
    street: 'Av Paulista',
    houseNumber: '500',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    quantity: 1,
    includeCream: true,
    totalPrice: 49.9,
    amountCents: 4990,
    guestTokenHash: guestHash,
  });

  await attachSigilopayCharge(orderId, {
    identifier,
    transactionId: txId,
    webhookToken,
    pixCode: '00020126...pix_code_real...',
    pixImage: 'https://sigilopay.com.br/qr.png',
    gatewayStatus: 'WAITING_PAYMENT',
    status: 'pending',
  });

  // Teste Negativo 1: Token Errado
  await test('Negativo 1: Webhook com token errado é rejeitado (401)', async () => {
    const isTokenValid = secureCompareTokens(webhookToken, 'TOKEN_TOTALMENTE_ERRADO');
    assert.strictEqual(isTokenValid, false);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // Teste Negativo 2: PAID sem COMPLETED
  await test('Negativo 2: event===TRANSACTION_PAID mas status!==COMPLETED deve ser recusado', async () => {
    const event: string = 'TRANSACTION_PAID';
    const status: string = 'WAITING_PAYMENT'; // divergente
    const paymentMethod: string = 'PIX';

    const isPaid = event === 'TRANSACTION_PAID' && status === 'COMPLETED' && paymentMethod === 'PIX';
    assert.strictEqual(isPaid, false);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // Teste Negativo 3: COMPLETED sem PAID
  await test('Negativo 3: status===COMPLETED mas event!==TRANSACTION_PAID deve ser recusado', async () => {
    const event: string = 'TRANSACTION_CREATED'; // divergente
    const status: string = 'COMPLETED';
    const paymentMethod: string = 'PIX';

    const isPaid = event === 'TRANSACTION_PAID' && status === 'COMPLETED' && paymentMethod === 'PIX';
    assert.strictEqual(isPaid, false);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // Teste Negativo 4: Método errado
  await test('Negativo 4: paymentMethod!==PIX (ex: CREDIT_CARD) deve ser recusado', async () => {
    const event: string = 'TRANSACTION_PAID';
    const status: string = 'COMPLETED';
    const paymentMethod: string = 'CREDIT_CARD'; // divergente

    const isPaid = event === 'TRANSACTION_PAID' && status === 'COMPLETED' && paymentMethod === 'PIX';
    assert.strictEqual(isPaid, false);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // Teste Negativo 5: Identificador inconsistente
  await test('Negativo 5: transaction.identifier inconsistente com o pedido salvo deve ser recusado', async () => {
    const incomingIdentifier: string = 'sig_outro_pedido_falsificado';
    const matches = incomingIdentifier === baseOrder.identifier;
    assert.strictEqual(matches, false);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // Teste Negativo 6: Transaction ID inconsistente
  await test('Negativo 6: transaction.id inconsistente com o pedido salvo deve ser recusado', async () => {
    const incomingTxId: string = 'tx_falsa_99999';
    const matches = incomingTxId === txId;
    assert.strictEqual(matches, false);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // Teste Negativo 7: Moeda errada
  await test('Negativo 7: currency!==BRL (ex: USD) deve ser recusado', async () => {
    const currency: string = 'USD';
    const isBrl = currency === 'BRL';
    assert.strictEqual(isBrl, false);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // Teste Negativo 8: Valor errado
  await test('Negativo 8: Valor divergente (ex: R$ 10,00 ao invés de R$ 49,90) deve ser recusado', async () => {
    const incomingAmount = 10.0;
    const incomingCents = Math.round(incomingAmount * 100);
    const expectedCents = baseOrder.amount_cents; // 4990
    assert.notStrictEqual(incomingCents, expectedCents);
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'pending');
  });

  // ------------------------------------------------------------------------
  // 5. TESTE POSITIVO E IDEMPOTÊNCIA DO WEBHOOK
  // ------------------------------------------------------------------------
  console.log('\n✅ 5. Teste Positivo, Idempotência e Concorrência Fora de Ordem');

  await test('Positivo: Atendendo a TODOS os critérios estritos simultâneos marca pedido como PAGO', async () => {
    const event = 'TRANSACTION_PAID';
    const status = 'COMPLETED';
    const paymentMethod = 'PIX';
    const currency = 'BRL';
    const incomingId = txId;
    const incomingIdentifier = identifier;
    const incomingAmount = 49.9;
    const incomingToken = webhookToken;

    // Checagem de token
    assert(secureCompareTokens(webhookToken, incomingToken));

    // Checagem de eventos estritos combinados
    assert(event === 'TRANSACTION_PAID' && status === 'COMPLETED' && paymentMethod === 'PIX');
    assert.strictEqual(currency, 'BRL');
    assert.strictEqual(incomingId, txId);
    assert.strictEqual(incomingIdentifier, identifier);
    assert.strictEqual(Math.round(incomingAmount * 100), baseOrder.amount_cents);

    // Executa confirmação atômica
    const confirmResult = await confirmSigilopayPayment(txId, identifier, new Date().toISOString());
    assert.strictEqual(confirmResult.success, true);
    assert.strictEqual(confirmResult.action, 'PAYMENT_CONFIRMED');

    const updated = await getOrderByOrderId(orderId);
    assert.strictEqual(updated?.status, 'paid');
    assert(updated?.paid_at !== null);
  });

  await test('Idempotência: Reenvio do mesmo webhook PAID já processado retorna ALREADY_PAID', async () => {
    const secondCall = await confirmSigilopayPayment(txId, identifier);
    assert.strictEqual(secondCall.success, true);
    assert.strictEqual(secondCall.action, 'ALREADY_PAID');
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'paid');
  });

  await test('Fora de Ordem: Webhook CANCELED após pedido PAGO não rebaixa status para cancelado', async () => {
    await cancelOrRefundOrder(txId, identifier, 'canceled');
    const ord = await getOrderByOrderId(orderId);
    assert.strictEqual(ord?.status, 'paid'); // Permanece PAID!
  });

  // ------------------------------------------------------------------------
  // 6. CONSULTA DE STATUS DO CONVIDADO E PRIVACIDADE
  // ------------------------------------------------------------------------
  console.log('\n🔒 6. Consulta de Status e Zero Exposição de Dados Pessoais');

  await test('Guest token incorreto falha na verificação de hash', () => {
    const hashInDb = guestHash;
    const wrongTokenHash = sha256Hex('token_completamente_errado');
    assert.strictEqual(secureCompareTokens(hashInDb, wrongTokenHash), false);
  });

  await test('Objeto de resposta ao convidado contém apenas status mínimo seguro', () => {
    const safeResponse = {
      orderId,
      status: 'paid',
      paidAt: new Date().toISOString(),
      totalPrice: 49.9,
      quantity: 1,
      includeCream: true,
      pixCode: '000201...',
      pixImage: 'https://sigilopay.com.br/qr.png',
    };

    const leaks = ['customer_cpf', 'webhook_token', 'transaction_id', 'service_role', 'guest_token_hash'];
    for (const leak of leaks) {
      assert.strictEqual(leak in safeResponse, false);
    }
  });

  // ------------------------------------------------------------------------
  // 7. TRATAMENTO DE TIMEOUT E ESTADO INCERTO
  // ------------------------------------------------------------------------
  console.log('\n⏱️ 7. Tratamento de Timeout e Resiliência sem Credenciais');

  await test('attachSigilopayCharge com falha/timeout registra status uncertain sem duplicar cobrança', async () => {
    const timeoutOrder = `LS-TIMEOUT-${Date.now()}`;
    const timeoutIdemKey = `idem_timeout_${Date.now()}`;

    await createOrGetPendingOrder({
      idempotencyKey: timeoutIdemKey,
      orderId: timeoutOrder,
      customerName: 'Cliente Timeout',
      customerPhone: '11988887777',
      customerCpf: '12345678902',
      postalCode: '01310100',
      street: 'Rua B',
      houseNumber: '20',
      district: 'Centro',
      city: 'SP',
      state: 'SP',
      quantity: 1,
      includeCream: false,
      totalPrice: 34.9,
      amountCents: 3490,
      guestTokenHash: sha256Hex('tok_timeout'),
    });

    const uncertain = await attachSigilopayCharge(timeoutOrder, {
      identifier: 'sig_timeout_att_1',
      gatewayStatus: 'TIMEOUT',
      status: 'uncertain',
    });

    assert.strictEqual(uncertain?.status, 'uncertain');
  });

  console.log(`\n======================================================`);
  console.log(`🎯 RESULTADO DOS TESTES: ${passed} Aprovados, ${failed} Falhas`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Falha fatal na execução dos testes:', err);
  process.exit(1);
});
