import { Router, Request, Response } from 'express';
import {
  CONFIG,
  calculateOrderAmounts,
  isSigiloPayConfigured,
  isSupabaseServiceConfigured,
  sanitizeDigits,
} from './config';
import { createPixCharge, secureCompareTokens } from './sigilopay';
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
  sha256Hex,
} from './db';
import { isValidCPF, isValidPhone, VALID_UFS, EMAIL_REGEX } from '../supabase/functions/checkout-api/index';

export const apiRouter = Router();

apiRouter.get('/config-status', (_req: Request, res: Response) => {
  res.json({
    sigilopayConfigured: isSigiloPayConfigured(),
    supabaseConfigured: isSupabaseServiceConfigured(),
  });
});

/**
 * POST /api/checkout/create-charge
 */
apiRouter.post('/checkout/create-charge', async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Verificação prévia de credenciais ANTES de criar pedidos
    if (!isSigiloPayConfigured()) {
      res.status(503).json({
        success: false,
        error: {
          errorCode: 'GATEWAY_NOT_CONFIGURED',
          message:
            'A integração Sigilo Pay está pronta no código, mas aguarda as variáveis de ambiente SIGILOPAY_PUBLIC_KEY, SIGILOPAY_SECRET_KEY e SIGILOPAY_CALLBACK_URL no servidor.',
        },
      });
      return;
    }

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
    } = req.body;

    // 2. Validações estritas de dados de entrada
    if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100 || name.trim().split(' ').length < 2) {
      res.status(400).json({ success: false, error: { message: 'Nome completo obrigatório (nome e sobrenome, max 100 caracteres).' } });
      return;
    }

    if (!email || typeof email !== 'string' || email.trim().length > 100 || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ success: false, error: { message: 'E-mail obrigatório com formato válido.' } });
      return;
    }

    const cleanCpf = sanitizeDigits(document);
    if (!isValidCPF(cleanCpf)) {
      res.status(400).json({ success: false, error: { message: 'CPF inválido (dígitos verificadores incorretos).' } });
      return;
    }

    const cleanPhone = sanitizeDigits(phone);
    if (!isValidPhone(cleanPhone)) {
      res.status(400).json({ success: false, error: { message: 'WhatsApp/telefone inválido com DDD (10 ou 11 dígitos).' } });
      return;
    }

    const cleanCep = sanitizeDigits(postalCode);
    if (cleanCep.length !== 8) {
      res.status(400).json({ success: false, error: { message: 'CEP inválido (8 dígitos).' } });
      return;
    }

    if (!street || typeof street !== 'string' || street.trim().length < 2 || street.trim().length > 120 ||
        !houseNumber || typeof houseNumber !== 'string' || houseNumber.trim().length < 1 || houseNumber.trim().length > 20 ||
        !district || typeof district !== 'string' || district.trim().length < 2 || district.trim().length > 60 ||
        !city || typeof city !== 'string' || city.trim().length < 2 || city.trim().length > 60) {
      res.status(400).json({ success: false, error: { message: 'Endereço de entrega incompleto.' } });
      return;
    }

    const cleanState = String(state || '').trim().toUpperCase();
    if (!VALID_UFS.has(cleanState)) {
      res.status(400).json({ success: false, error: { message: 'UF inválida (estado brasileiro inexistente).' } });
      return;
    }

    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      res.status(400).json({ success: false, error: { message: 'Quantidade deve ser um número inteiro de 1 a 10.' } });
      return;
    }

    if (typeof includeCream !== 'boolean') {
      res.status(400).json({ success: false, error: { message: 'Opção do clareador deve ser um booleano.' } });
      return;
    }

    const safeQty = quantity;
    const safeCream = includeCream;
    const { amountCents, amountReais, items } = calculateOrderAmounts(safeQty, safeCream);

    // Chave estável de idempotência e token do convidado
    const idempotencyKey = String(rawIdemKey || '').trim().slice(0, 128) || buildIdempotencyKey(cleanCpf, cleanPhone, safeQty, safeCream);
    const clientGuestToken = String(rawGuestToken || '').trim().slice(0, 128) || generateGuestToken().rawToken;
    const guestTokenHash = sha256Hex(clientGuestToken);

    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const newOrderId = `LS-${randomSuffix}`;
    const newIdentifier = generateOrderAttemptIdentifier(newOrderId);

    // 3. Desduplicação durável com bloqueio e checagem de abuso
    const { existing, order, isAbusive, tokenMismatch } = await createOrGetPendingOrder({
      idempotencyKey,
      orderId: newOrderId,
      identifier: newIdentifier,
      customerName: name.trim(),
      customerEmail: email.trim().toLowerCase(),
      customerPhone: cleanPhone,
      customerCpf: cleanCpf,
      postalCode: cleanCep,
      street: street.trim(),
      houseNumber: houseNumber.trim(),
      complement: complement ? String(complement).trim().slice(0, 60) : null,
      district: district.trim(),
      city: city.trim(),
      state: cleanState,
      quantity: safeQty,
      includeCream: safeCream,
      totalPrice: amountReais,
      amountCents,
      guestTokenHash,
    });

    if (isAbusive) {
      res.status(429).json({ success: false, error: { message: 'Limite de tentativas excedido para este CPF. Tente mais tarde.' } });
      return;
    }

    if (tokenMismatch) {
      res.status(403).json({ success: false, error: { message: 'Conflito de autenticação da sessão de compra.' } });
      return;
    }

    if (existing) {
      if (order.status === 'creating') {
        res.status(409).json({
          success: false,
          status: 'creating',
          error: { message: 'Cobrança em processamento preliminar. Aguarde alguns instantes.' },
        });
        return;
      }

      if (order.status === 'uncertain') {
        res.status(409).json({
          success: false,
          status: 'uncertain',
          error: { message: 'Cobrança aguardando confirmação do gateway. Não tente recriar para evitar cobrança dupla.' },
        });
        return;
      }

      if (order.status === 'paid') {
        res.json({
          success: true,
          orderId: order.order_id,
          guestToken: clientGuestToken,
          status: 'paid',
          totalPrice: order.total_price,
        });
        return;
      }

      if (order.pix_code) {
        res.json({
          success: true,
          orderId: order.order_id,
          guestToken: clientGuestToken,
          pixCode: order.pix_code,
          pixImage: order.pix_image || null,
          expiresAt: order.expires_at || null,
          totalPrice: order.total_price,
          status: order.status,
        });
        return;
      }
    }

    const activeOrderId = order.order_id;
    const activeIdentifier = order.identifier || newIdentifier;

    // 4. Chamada Sigilo Pay
    const gatewayResult = await createPixCharge({
      identifier: activeIdentifier,
      amount: amountReais,
      client: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: cleanPhone,
        document: cleanCpf,
      },
      products: items,
      metadata: {
        provider: 'Checkout',
        orderId: activeOrderId,
      },
    });

    if (!gatewayResult.success) {
      await attachSigilopayCharge(activeOrderId, {
        identifier: activeIdentifier,
        status: 'uncertain',
        gatewayStatus: gatewayResult.error.errorCode || 'FAILED',
      });

      res.status(gatewayResult.error.statusCode >= 400 && gatewayResult.error.statusCode < 600 ? gatewayResult.error.statusCode : 502).json({
        success: false,
        error: { message: 'Falha ao gerar cobrança no gateway.' },
      });
      return;
    }

    const { transactionId, transactionStatus, webhookToken, pix } = gatewayResult.data;

    if (!transactionId || !webhookToken || !pix.code) {
      await attachSigilopayCharge(activeOrderId, {
        identifier: activeIdentifier,
        status: 'uncertain',
        gatewayStatus: 'INCOMPLETE_RESPONSE',
      });

      res.status(502).json({
        success: false,
        error: { message: 'Gateway retornou dados incompletos.' },
      });
      return;
    }

    const attached = await attachSigilopayCharge(activeOrderId, {
      identifier: activeIdentifier,
      transactionId,
      webhookToken,
      pixCode: pix.code,
      pixImage: pix.image || null,
      expiresAt: pix.expiresAt || null,
      gatewayStatus: transactionStatus,
      status: 'pending',
    });

    if (!attached) {
      res.status(500).json({ success: false, error: { message: 'Falha de persistência ao anexar cobrança.' } });
      return;
    }

    res.json({
      success: true,
      orderId: activeOrderId,
      guestToken: clientGuestToken,
      pixCode: pix.code,
      pixImage: pix.image || null,
      expiresAt: pix.expiresAt || null,
      totalPrice: amountReais,
      status: 'pending',
    });
  } catch {
    res.status(500).json({ success: false, error: { message: 'Erro interno ao processar o checkout.' } });
  }
});

/**
 * GET /api/checkout/status
 */
apiRouter.get('/checkout/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = String(req.query.orderId || '');
    const guestToken = String(req.query.token || '');

    if (!orderId || !guestToken) {
      res.status(400).json({ success: false, error: 'orderId e token são obrigatórios.' });
      return;
    }

    const order = await getOrderByOrderId(orderId);
    if (!order) {
      res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
      return;
    }

    const tokenHash = sha256Hex(guestToken);
    if (!secureCompareTokens(order.guest_token_hash, tokenHash)) {
      res.status(403).json({ success: false, error: 'Acesso não autorizado para este pedido.' });
      return;
    }

    res.json({
      success: true,
      orderId: order.order_id,
      status: order.status,
      paidAt: order.paid_at || null,
      totalPrice: order.total_price,
      quantity: order.quantity,
      includeCream: order.include_cream,
      pixCode: order.pix_code,
      pixImage: order.pix_image || null,
      expiresAt: order.expires_at || null,
    });
  } catch {
    res.status(500).json({ success: false, error: 'Erro interno ao consultar pedido.' });
  }
});

/**
 * POST /api/webhooks/sigilopay
 */
apiRouter.post('/webhooks/sigilopay', async (req: Request, res: Response): Promise<void> => {
  try {
    const { event, token, transaction } = req.body || {};

    if (!transaction || !token || typeof transaction !== 'object') {
      res.status(400).json({ error: 'Payload do webhook inválido: token e transaction são obrigatórios.' });
      return;
    }

    const transactionId = String(transaction.id || '').trim();
    const identifier = String(transaction.identifier || '').trim();

    if (!transactionId || !identifier) {
      res.status(400).json({ error: 'transaction.id e identifier são obrigatórios.' });
      return;
    }

    const order = await getOrderByTransactionId(transactionId);
    if (!order) {
      res.status(404).json({ error: 'Pedido associado ao transaction_id não localizado.' });
      return;
    }

    if (order.identifier !== identifier) {
      res.status(400).json({ error: 'Identificadores da transação inconsistentes com a cobrança salva.' });
      return;
    }

    // Corrida de webhook: se o webhook chegou antes de salvar o webhook_token
    if (!order.webhook_token) {
      res.setHeader('Retry-After', '3');
      res.status(503).json({ error: 'Cobrança em persistência. Tente novamente em instantes.' });
      return;
    }

    if (!secureCompareTokens(order.webhook_token, String(token))) {
      res.status(401).json({ error: 'Token de autenticação do webhook inválido.' });
      return;
    }

    // Idempotência
    if (order.status === 'paid' && (event === 'TRANSACTION_PAID' || transaction.status === 'COMPLETED')) {
      res.status(200).json({ received: true, status: 'already_paid' });
      return;
    }

    const isStrictPaid =
      event === 'TRANSACTION_PAID' &&
      transaction.status === 'COMPLETED' &&
      transaction.paymentMethod === 'PIX';

    if (isStrictPaid) {
      if (String(transaction.currency || '').toUpperCase() !== 'BRL') {
        res.status(400).json({ error: 'Moeda da transação incompatível.' });
        return;
      }

      const transactionAmountCents = Math.round(Number(transaction.amount) * 100);
      if (transactionAmountCents !== order.amount_cents) {
        res.status(400).json({ error: 'Valor da transação não confere com o pedido.' });
        return;
      }

      const result = await confirmSigilopayPayment(transactionId, identifier, transaction.payedAt);
      if (!result.success) {
        res.status(400).json({ error: result.action });
        return;
      }

      res.status(200).json({ received: true, status: 'paid_confirmed', data: result });
      return;
    }

    if (event === 'TRANSACTION_PAID') {
      res.status(400).json({ error: 'Evento de pagamento não atende aos critérios estritos.' });
      return;
    }

    if (event === 'TRANSACTION_CANCELED' || transaction.status === 'CANCELED') {
      const ok = await cancelOrRefundOrder(transactionId, identifier, 'canceled');
      if (!ok) {
        res.status(400).json({ error: 'Cancelamento não permitido para este pedido.' });
        return;
      }
      res.status(200).json({ received: true, status: 'canceled' });
      return;
    }

    if (event === 'TRANSACTION_REFUNDED' || transaction.status === 'REFUNDED') {
      await cancelOrRefundOrder(transactionId, identifier, 'refunded');
      res.status(200).json({ received: true, status: 'refunded' });
      return;
    }

    if (event === 'TRANSACTION_CHARGED_BACK' || transaction.status === 'CHARGED_BACK') {
      await cancelOrRefundOrder(transactionId, identifier, 'charged_back');
      res.status(200).json({ received: true, status: 'charged_back' });
      return;
    }

    res.status(200).json({ received: true, status: 'acknowledged' });
  } catch {
    res.status(500).json({ error: 'Erro interno ao processar webhook.' });
  }
});
