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
    } = req.body;

    // 1. Validações de entrada: Preserva caracteres intactos em nome e email (NÃO remove dígitos)
    if (!name || typeof name !== 'string' || name.trim().split(' ').length < 2) {
      res.status(400).json({ success: false, error: { message: 'Nome completo obrigatório (nome e sobrenome).' } });
      return;
    }

    const cleanCpf = sanitizeDigits(document);
    if (cleanCpf.length !== 11) {
      res.status(400).json({ success: false, error: { message: 'CPF inválido (11 dígitos).' } });
      return;
    }

    const cleanPhone = sanitizeDigits(phone);
    if (cleanPhone.length < 10) {
      res.status(400).json({ success: false, error: { message: 'WhatsApp/telefone inválido com DDD.' } });
      return;
    }

    const cleanCep = sanitizeDigits(postalCode);
    if (cleanCep.length !== 8) {
      res.status(400).json({ success: false, error: { message: 'CEP inválido (8 dígitos).' } });
      return;
    }

    if (!street || !houseNumber || !district || !city || !state) {
      res.status(400).json({ success: false, error: { message: 'Endereço de entrega incompleto.' } });
      return;
    }

    const safeQty = Math.max(1, Math.floor(Number(quantity) || 1));
    const safeCream = Boolean(includeCream);
    const { amountCents, amountReais, items } = calculateOrderAmounts(safeQty, safeCream);

    // 2. Desduplicação durável
    const idempotencyKey = buildIdempotencyKey(cleanCpf, cleanPhone, safeQty, safeCream);
    const { rawToken, hash: guestTokenHash } = generateGuestToken();
    const newOrderId = `LS-${Math.floor(100000 + Math.random() * 900000)}`;

    const { existing, order } = await createOrGetPendingOrder({
      idempotencyKey,
      orderId: newOrderId,
      customerName: name.trim(),
      customerEmail: email ? String(email).trim().toLowerCase() : null,
      customerPhone: cleanPhone,
      customerCpf: cleanCpf,
      postalCode: cleanCep,
      street: String(street).trim(),
      houseNumber: String(houseNumber).trim(),
      complement: complement ? String(complement).trim() : null,
      district: String(district).trim(),
      city: String(city).trim(),
      state: String(state).trim().toUpperCase(),
      quantity: safeQty,
      includeCream: safeCream,
      totalPrice: amountReais,
      amountCents,
      guestTokenHash,
    });

    if (existing && order.pix_code) {
      res.json({
        success: true,
        orderId: order.order_id,
        guestToken: rawToken,
        pixCode: order.pix_code,
        pixImage: order.pix_image || null,
        totalPrice: order.total_price,
        status: order.status,
      });
      return;
    }

    // 3. Verificação de credenciais
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

    const attemptIdentifier = generateOrderAttemptIdentifier(order.order_id);

    // 4. Chamada Sigilo Pay
    const gatewayResult = await createPixCharge({
      identifier: attemptIdentifier,
      amount: amountReais,
      client: {
        name: name.trim(),
        email: email ? String(email).trim().toLowerCase() : undefined,
        phone: cleanPhone,
        document: cleanCpf,
      },
      products: items,
      metadata: {
        provider: 'Checkout',
        orderId: order.order_id,
      },
    });

    if (!gatewayResult.success) {
      const isTimeout = gatewayResult.error.errorCode === 'GATEWAY_TIMEOUT';
      await attachSigilopayCharge(order.order_id, {
        identifier: attemptIdentifier,
        status: isTimeout ? 'uncertain' : 'uncertain',
        gatewayStatus: gatewayResult.error.errorCode,
      });

      res.status(gatewayResult.error.statusCode >= 400 && gatewayResult.error.statusCode < 600 ? gatewayResult.error.statusCode : 502).json({
        success: false,
        error: gatewayResult.error,
      });
      return;
    }

    const { transactionId, transactionStatus, webhookToken, pix } = gatewayResult.data;

    await attachSigilopayCharge(order.order_id, {
      identifier: attemptIdentifier,
      transactionId,
      webhookToken,
      pixCode: pix.code,
      pixImage: pix.image || null,
      gatewayStatus: transactionStatus,
      status: 'pending',
    });

    res.json({
      success: true,
      orderId: order.order_id,
      guestToken: rawToken,
      pixCode: pix.code,
      pixImage: pix.image || null,
      expiresAt: pix.expiresAt || null,
      totalPrice: amountReais,
      status: 'pending',
    });
  } catch (err: any) {
    console.error('Erro em create-charge:', err);
    res.status(500).json({ success: false, error: { message: 'Erro interno ao processar o checkout.' } });
  }
});

/**
 * GET /api/checkout/status
 * Protegido com hash SHA-256 do guest token
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
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Erro interno ao consultar pedido.' });
  }
});

/**
 * POST /api/webhooks/sigilopay
 * Exige ESTRITAMENTE:
 * event === 'TRANSACTION_PAID' &&
 * transaction.status === 'COMPLETED' &&
 * transaction.paymentMethod === 'PIX' &&
 * currency === 'BRL' &&
 * amount confere &&
 * transaction.id E identifier consistentes com a cobrança salva
 */
apiRouter.post('/webhooks/sigilopay', async (req: Request, res: Response): Promise<void> => {
  try {
    const { event, token, transaction } = req.body || {};

    if (!transaction || !token) {
      res.status(400).json({ error: 'Payload do webhook inválido: token e transaction são obrigatórios.' });
      return;
    }

    const transactionId = String(transaction.id || '');
    const identifier = String(transaction.identifier || '');

    const order = await getOrderByTransactionId(transactionId);
    if (!order) {
      res.status(404).json({ error: 'Pedido associado à transação não foi localizado.' });
      return;
    }

    // 1. Validação estrita do token do webhook
    if (!order.webhook_token || !secureCompareTokens(order.webhook_token, String(token))) {
      res.status(401).json({ error: 'Token de autenticação do webhook inválido.' });
      return;
    }

    // 2. Idempotência se já estiver pago
    if (order.status === 'paid' && (event === 'TRANSACTION_PAID' || transaction.status === 'COMPLETED')) {
      res.status(200).json({ received: true, status: 'already_paid' });
      return;
    }

    // 3. Exigência obrigatória de TODOS os critérios combinados (strict &&)
    const isStrictPaid =
      event === 'TRANSACTION_PAID' &&
      transaction.status === 'COMPLETED' &&
      transaction.paymentMethod === 'PIX';

    if (isStrictPaid) {
      // Moeda BRL
      if (String(transaction.currency || '').toUpperCase() !== 'BRL') {
        res.status(400).json({ error: 'Moeda da transação incompatível.' });
        return;
      }

      // Consistência de AMBOS os identificadores
      if (transaction.id !== order.transaction_id || transaction.identifier !== order.identifier) {
        res.status(400).json({ error: 'Identificadores da transação inconsistentes com a cobrança salva.' });
        return;
      }

      // Valor exato em centavos
      const transactionAmountCents = Math.round(Number(transaction.amount) * 100);
      if (transactionAmountCents !== order.amount_cents) {
        res.status(400).json({ error: 'Valor da transação não confere com o pedido.' });
        return;
      }

      // Confirmação atômica
      const result = await confirmSigilopayPayment(transactionId, identifier, transaction.payedAt);
      res.status(200).json({ received: true, status: 'paid_confirmed', data: result });
      return;
    }

    // 4. Cancelamentos e estornos
    if (event === 'TRANSACTION_CANCELED' || transaction.status === 'CANCELED') {
      await cancelOrRefundOrder(transactionId, identifier, 'canceled');
      res.status(200).json({ received: true, status: 'canceled' });
      return;
    }

    if (event === 'TRANSACTION_REFUNDED' || transaction.status === 'REFUNDED') {
      await cancelOrRefundOrder(transactionId, identifier, 'refunded');
      res.status(200).json({ received: true, status: 'refunded' });
      return;
    }

    res.status(200).json({ received: true, status: 'acknowledged' });
  } catch (err: any) {
    console.error('Erro no webhook Sigilo Pay:', err);
    res.status(500).json({ error: 'Erro interno ao processar webhook.' });
  }
});
