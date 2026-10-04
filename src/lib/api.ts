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
  status?: 'creating' | 'pending' | 'uncertain' | 'paid' | 'canceled' | 'refunded';
  paidAt?: string | null;
  totalPrice?: number;
  quantity?: number;
  includeCream?: boolean;
  pixCode?: string;
  pixImage?: string | null;
  error?: string;
}

export interface ConfigStatusResponse {
  sigilopayConfigured: boolean;
  supabaseConfigured: boolean;
}

// Em produção Cloudflare Pages, VITE_CHECKOUT_API_URL aponta para:
// https://ojvznzupiojimykqryhw.supabase.co/functions/v1/checkout-api
const API_BASE_URL = (import.meta.env.VITE_CHECKOUT_API_URL || '').replace(/\/$/, '');

export async function createCheckoutCharge(
  formData: CheckoutFormData,
  quantity: number,
  includeCream: boolean
): Promise<CreateChargeResponse> {
  const payload = {
    name: formData.name.trim(), // Preserva caracteres e espaços intactos
    email: formData.email ? formData.email.trim().toLowerCase() : undefined,
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
