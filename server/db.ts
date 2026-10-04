import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG, isSupabaseServiceConfigured } from './config';

export interface OrderRecord {
  id?: string;
  order_id: string;
  identifier: string;
  idempotency_key: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_cpf: string;
  postal_code: string;
  street: string;
  house_number: string;
  complement?: string | null;
  district: string;
  city: string;
  state: string;
  quantity: number;
  include_cream: boolean;
  total_price: number;
  amount_cents: number;
  currency: string;
  payment_method: string;
  status: 'creating' | 'pending' | 'uncertain' | 'paid' | 'canceled' | 'refunded' | 'charged_back';
  pix_code?: string;
  pix_image?: string | null;
  expires_at?: string | null;
  transaction_id?: string;
  webhook_token?: string;
  guest_token_hash: string;
  paid_at?: string | null;
  gateway_status?: string | null;
  created_at: string;
  updated_at: string;
}

export function sha256Hex(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

export function generateGuestToken(): { rawToken: string; hash: string } {
  const rawToken = crypto.randomBytes(24).toString('hex');
  const hash = sha256Hex(rawToken);
  return { rawToken, hash };
}

export function generateOrderAttemptIdentifier(orderId: string): string {
  const nonce = crypto.randomBytes(4).toString('hex');
  return `sig_${orderId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}_${Date.now()}_${nonce}`;
}

export function buildIdempotencyKey(cpf: string, phone: string, quantity: number, includeCream: boolean): string {
  return sha256Hex(`idem_${cpf}_${phone}_${quantity}_${includeCream}`);
}

const memoryOrders = new Map<string, OrderRecord>();
const memoryAttemptsByCpf = new Map<string, number[]>();

let supabaseAdmin: SupabaseClient | null = null;
if (isSupabaseServiceConfigured()) {
  supabaseAdmin = createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cria ou recupera pedido preliminar com desduplicação durável.
 */
export async function createOrGetPendingOrder(params: {
  idempotencyKey: string;
  orderId: string;
  identifier: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerCpf: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  complement?: string | null;
  district: string;
  city: string;
  state: string;
  quantity: number;
  includeCream: boolean;
  totalPrice: number;
  amountCents: number;
  guestTokenHash: string;
}): Promise<{ existing: boolean; order: OrderRecord; isAbusive?: boolean; tokenMismatch?: boolean }> {
  // 1. Tenta RPC do Supabase se configurado
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc('rpc_create_or_get_pending_order', {
        p_idempotency_key: params.idempotencyKey,
        p_order_id: params.orderId,
        p_identifier: params.identifier,
        p_customer_name: params.customerName,
        p_customer_email: params.customerEmail,
        p_customer_phone: params.customerPhone,
        p_customer_cpf: params.customerCpf,
        p_postal_code: params.postalCode,
        p_street: params.street,
        p_house_number: params.houseNumber,
        p_complement: params.complement || null,
        p_district: params.district,
        p_city: params.city,
        p_state: params.state,
        p_quantity: params.quantity,
        p_include_cream: params.includeCream,
        p_total_price: params.totalPrice,
        p_amount_cents: params.amountCents,
        p_guest_token_hash: params.guestTokenHash,
      });

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        if (row.is_abusive) return { existing: false, order: {} as any, isAbusive: true };
        if (row.token_mismatch) return { existing: true, order: {} as any, tokenMismatch: true };

        const existing = Boolean(row.existing);
        const actualOrderId = row.order_id || params.orderId;
        const fetched = await getOrderByOrderId(actualOrderId);
        if (fetched) {
          return { existing, order: fetched };
        }
      }
    } catch (err) {
      console.warn('Fallback para memoryStore no createOrGetPendingOrder:', err);
    }
  }

  // 2. Proteção contra abuso em memória (15 tentativas na última hora)
  const now = Date.now();
  const recent = (memoryAttemptsByCpf.get(params.customerCpf) || []).filter((t) => now - t < 3600000);
  if (recent.length >= 15) {
    return { existing: false, order: {} as any, isAbusive: true };
  }
  recent.push(now);
  memoryAttemptsByCpf.set(params.customerCpf, recent);

  // 3. Fallback de desduplicação em memória
  for (const ord of memoryOrders.values()) {
    if (ord.idempotency_key === params.idempotencyKey) {
      if (ord.guest_token_hash !== params.guestTokenHash) {
        return { existing: true, order: ord, tokenMismatch: true };
      }
      return { existing: true, order: ord };
    }
  }

  const record: OrderRecord = {
    order_id: params.orderId,
    identifier: params.identifier,
    idempotency_key: params.idempotencyKey,
    customer_name: params.customerName,
    customer_email: params.customerEmail,
    customer_phone: params.customerPhone,
    customer_cpf: params.customerCpf,
    postal_code: params.postalCode,
    street: params.street,
    house_number: params.houseNumber,
    complement: params.complement || null,
    district: params.district,
    city: params.city,
    state: params.state,
    quantity: params.quantity,
    include_cream: params.includeCream,
    total_price: params.totalPrice,
    amount_cents: params.amountCents,
    currency: 'BRL',
    payment_method: 'PIX',
    status: 'creating',
    guest_token_hash: params.guestTokenHash,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  memoryOrders.set(record.order_id, record);
  memoryOrders.set(record.identifier, record);
  return { existing: false, order: record };
}

/**
 * Anexa a resposta da Sigilo Pay à ordem.
 */
export async function attachSigilopayCharge(
  orderId: string,
  charge: {
    identifier: string;
    transactionId?: string;
    webhookToken?: string;
    pixCode?: string;
    pixImage?: string | null;
    expiresAt?: string | null;
    gatewayStatus?: string;
    status: 'pending' | 'uncertain';
  }
): Promise<OrderRecord | null> {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc('rpc_attach_sigilopay_charge', {
        p_order_id: orderId,
        p_identifier: charge.identifier,
        p_transaction_id: charge.transactionId || null,
        p_webhook_token: charge.webhookToken || null,
        p_pix_code: charge.pixCode || null,
        p_pix_image: charge.pixImage || null,
        p_expires_at: charge.expiresAt ? new Date(charge.expiresAt).toISOString() : null,
        p_gateway_status: charge.gatewayStatus || null,
        p_status: charge.status,
      });
      if (error || !data) return null;
    } catch (err) {
      console.warn('Erro ao anexar cobrança no Supabase:', err);
    }
  }

  const existing = await getOrderByOrderId(orderId);
  if (!existing) return null;

  const updated: OrderRecord = {
    ...existing,
    identifier: charge.identifier,
    transaction_id: charge.transactionId || existing.transaction_id,
    webhook_token: charge.webhookToken || existing.webhook_token,
    pix_code: charge.pixCode || existing.pix_code,
    pix_image: charge.pixImage || existing.pix_image,
    expires_at: charge.expiresAt || existing.expires_at,
    gateway_status: charge.gatewayStatus || existing.gateway_status,
    status: charge.status,
    updated_at: new Date().toISOString(),
  };

  memoryOrders.set(orderId, updated);
  if (updated.transaction_id) memoryOrders.set(updated.transaction_id, updated);
  if (updated.identifier) memoryOrders.set(updated.identifier, updated);

  return updated;
}

export async function getOrderByOrderId(orderId: string): Promise<OrderRecord | null> {
  if (memoryOrders.has(orderId)) return memoryOrders.get(orderId)!;

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from('orders').select('*').eq('order_id', orderId).maybeSingle();
    if (data) {
      memoryOrders.set(data.order_id, data);
      return data as OrderRecord;
    }
  }

  return null;
}

export async function getOrderByTransactionId(transactionId: string): Promise<OrderRecord | null> {
  if (memoryOrders.has(transactionId)) return memoryOrders.get(transactionId)!;

  for (const ord of memoryOrders.values()) {
    if (ord.transaction_id === transactionId) return ord;
  }

  if (supabaseAdmin) {
    const { data } = await supabaseAdmin.from('orders').select('*').eq('transaction_id', transactionId).maybeSingle();
    if (data) {
      memoryOrders.set(transactionId, data);
      return data as OrderRecord;
    }
  }

  return null;
}

export async function confirmSigilopayPayment(
  transactionId: string,
  identifier: string,
  payedAt?: string
): Promise<{ success: boolean; action: string; orderId?: string }> {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc('rpc_confirm_sigilopay_payment', {
        p_transaction_id: transactionId,
        p_identifier: identifier,
        p_payed_at: payedAt || new Date().toISOString(),
        p_gateway_status: 'COMPLETED',
      });

      if (!error && data) {
        const row = Array.isArray(data) ? data[0] : data;
        return { success: Boolean(row.success), action: row.action, orderId: row.order_id };
      }
    } catch (err) {
      console.warn('Erro no RPC confirm_sigilopay_payment:', err);
    }
  }

  const order = await getOrderByTransactionId(transactionId);
  if (!order || order.identifier !== identifier) return { success: false, action: 'ORDER_NOT_FOUND' };

  if (['refunded', 'charged_back'].includes(order.status)) {
    return { success: false, action: 'TERMINAL_STATE_CANNOT_REVERT', orderId: order.order_id };
  }

  if (order.status === 'paid') {
    return { success: true, action: 'ALREADY_PAID', orderId: order.order_id };
  }

  order.status = 'paid';
  order.paid_at = payedAt || new Date().toISOString();
  order.gateway_status = 'COMPLETED';
  order.updated_at = new Date().toISOString();

  memoryOrders.set(order.order_id, order);
  return { success: true, action: 'PAYMENT_CONFIRMED', orderId: order.order_id };
}

export async function cancelOrRefundOrder(
  transactionId: string,
  identifier: string,
  newStatus: 'canceled' | 'refunded' | 'charged_back'
): Promise<boolean> {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc('rpc_update_order_cancellation', {
        p_transaction_id: transactionId,
        p_identifier: identifier,
        p_new_status: newStatus,
        p_gateway_status: newStatus.toUpperCase(),
      });
      if (error || !data) return false;
      const row = Array.isArray(data) ? data[0] : data;
      return Boolean(row.success);
    } catch (err) {
      console.warn('Erro no RPC update_order_cancellation:', err);
    }
  }

  const order = await getOrderByTransactionId(transactionId);
  if (!order || order.identifier !== identifier) return false;

  if (order.status === 'paid' && newStatus === 'canceled') {
    return false; // Não cancela pedido pago
  }

  order.status = newStatus;
  order.gateway_status = newStatus.toUpperCase();
  order.updated_at = new Date().toISOString();
  memoryOrders.set(order.order_id, order);

  return true;
}
