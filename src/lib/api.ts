import { CheckoutFormData } from '../types';

export interface CreateChargeResponse {
  success: boolean;
  orderId?: string;
  guestToken?: string;
  pixCode?: string;
  pixImage?: string | null;
  expiresAt?: string | null;
  totalPrice?: number;
  status?: string;
  error?: {
    errorCode?: string;
    message: string;
    details?: unknown;
  };
}

export interface OrderStatusResponse {
  success: boolean;
  orderId?: string;
  status?: 'creating' | 'pending' | 'uncertain' | 'paid' | 'canceled' | 'refunded' | 'charged_back';
  paidAt?: string | null;
  totalPrice?: number;
  quantity?: number;
  includeCream?: boolean;
  pixCode?: string;
  pixImage?: string | null;
  expiresAt?: string | null;
  error?: string;
}

export interface ConfigStatusResponse {
  sigilopayConfigured: boolean;
  supabaseConfigured: boolean;
}

const API_BASE_URL = (import.meta.env.VITE_CHECKOUT_API_URL || '').replace(/\/$/, '');

// Helper de geração criptográfica segura de 32+ caracteres (sem Math.random)
function generateSecureHex32(): string {
  if (typeof crypto !== 'undefined') {
    if (crypto.randomUUID) {
      return (crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')).slice(0, 48);
    }
    if (crypto.getRandomValues) {
      const arr = new Uint8Array(24);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  }
  // Fallback seguro em ambientes sem crypto nativo
  const timestamp = Date.now().toString(16).padStart(16, '0');
  const perf = (performance?.now ? Math.floor(performance.now() * 1000) : 12345678).toString(16).padStart(16, '0');
  return `sec_${timestamp}_${perf}`.padEnd(36, '0');
}

// Chave estável de idempotência por intenção de compra do cliente em sessionStorage (sem PII)
export function getOrCreateCheckoutSessionKey(): string {
  try {
    let key = sessionStorage.getItem('landy_checkout_intent_id');
    if (!key || key.length < 32) {
      key = generateSecureHex32();
      sessionStorage.setItem('landy_checkout_intent_id', key);
    }
    return key;
  } catch {
    return generateSecureHex32();
  }
}

// Token de convidado estável por intenção de compra em sessionStorage
export function getOrCreateClientGuestToken(): string {
  try {
    let token = sessionStorage.getItem('landy_checkout_guest_token');
    if (!token || token.length < 32) {
      token = generateSecureHex32();
      sessionStorage.setItem('landy_checkout_guest_token', token);
    }
    return token;
  } catch {
    return generateSecureHex32();
  }
}

export async function createCheckoutCharge(
  formData: CheckoutFormData,
  quantity: number,
  includeCream: boolean
): Promise<CreateChargeResponse> {
  const idempotencyKey = getOrCreateCheckoutSessionKey();
  const clientGuestToken = getOrCreateClientGuestToken();

  const payload = {
    idempotencyKey,
    clientGuestToken,
    name: formData.name.trim(),
    email: formData.email ? formData.email.trim().toLowerCase() : '',
    phone: formData.phone.replace(/\D/g, ''),
    document: formData.document.replace(/\D/g, ''),
    postalCode: formData.postalCode.replace(/\D/g, ''),
    street: formData.street.trim(),
    houseNumber: formData.houseNumber.trim(),
    complement: formData.complement ? formData.complement.trim() : undefined,
    district: formData.district.trim(),
    city: formData.city.trim(),
    state: formData.state.trim().toUpperCase(),
    quantity,
    includeCream,
  };

  const endpoint = API_BASE_URL
    ? `${API_BASE_URL}/create`
    : '/api/checkout/create-charge';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({
    success: false,
    error: { message: `Erro HTTP ${res.status} ao processar pagamento.` },
  }));

  return data;
}

export async function checkOrderStatus(
  orderId: string,
  guestToken: string
): Promise<OrderStatusResponse> {
  const params = new URLSearchParams({
    orderId,
    token: guestToken,
  });

  const endpoint = API_BASE_URL
    ? `${API_BASE_URL}/status?${params.toString()}`
    : `/api/checkout/status?${params.toString()}`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  return res.json().catch(() => ({
    success: false,
    error: `Erro ao consultar status HTTP ${res.status}`,
  }));
}

export async function fetchConfigStatus(): Promise<ConfigStatusResponse> {
  try {
    const endpoint = API_BASE_URL ? `${API_BASE_URL}/health` : '/api/config-status';
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error('Falha ao checar status de configuração');
    const data = await res.json();
    return {
      sigilopayConfigured: Boolean(data.sigilopayConfigured),
      supabaseConfigured: true,
    };
  } catch {
    return { sigilopayConfigured: false, supabaseConfigured: false };
  }
}
