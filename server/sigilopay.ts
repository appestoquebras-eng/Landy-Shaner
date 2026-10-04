import crypto from 'crypto';
import { CONFIG, isSigiloPayConfigured } from './config';

export interface SigiloPayClientPayload {
  name: string;
  email?: string;
  phone: string;
  document: string;
}

export interface SigiloPayProductPayload {
  id: string;
  name: string;
  quantity: number;
  price: number;
  physical: boolean;
}

export interface CreatePixReceiveRequest {
  identifier: string;
  amount: number;
  client: SigiloPayClientPayload;
  products: SigiloPayProductPayload[];
  callbackUrl: string;
  metadata?: Record<string, string>;
  dueDate?: string;
}

export interface SigiloPayPixResponse {
  transactionId: string;
  status: string; // Operational status e.g. "OK"
  transactionStatus?: string; // e.g. "WAITING_PAYMENT", "PENDING"
  webhookToken: string;
  pix: {
    code: string;
    image?: string;
    expiresAt?: string;
  };
}

export interface SigiloPayApiError {
  statusCode: number;
  errorCode?: string;
  message: string;
  details?: unknown;
}

/**
 * Realiza a chamada segura ao endpoint oficial /gateway/pix/receive do Sigilo Pay.
 * As chaves públicas e secretas NUNCA são enviadas ao navegador.
 */
export async function createPixCharge(params: {
  identifier: string;
  amount: number;
  client: SigiloPayClientPayload;
  products: SigiloPayProductPayload[];
  metadata: { provider: 'Checkout'; orderId: string };
  dueDate?: string;
}): Promise<{ success: true; data: SigiloPayPixResponse } | { success: false; error: SigiloPayApiError }> {
  if (!isSigiloPayConfigured()) {
    return {
      success: false,
      error: {
        statusCode: 503,
        errorCode: 'GATEWAY_NOT_CONFIGURED',
        message:
          'Chaves da Sigilo Pay não configuradas no servidor (SIGILOPAY_PUBLIC_KEY, SIGILOPAY_SECRET_KEY, SIGILOPAY_CALLBACK_URL).',
      },
    };
  }

  const endpoint = `${CONFIG.SIGILOPAY.BASE_URL}/gateway/pix/receive`;

  const payload: CreatePixReceiveRequest = {
    identifier: params.identifier,
    amount: params.amount,
    client: {
      name: params.client.name.trim(),
      email: params.client.email?.trim() || undefined,
      phone: params.client.phone.replace(/\D/g, ''),
      document: params.client.document.replace(/\D/g, ''),
    },
    products: params.products,
    callbackUrl: CONFIG.SIGILOPAY.CALLBACK_URL,
    metadata: params.metadata,
    ...(params.dueDate ? { dueDate: params.dueDate } : {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-public-key': CONFIG.SIGILOPAY.PUBLIC_KEY,
        'x-secret-key': CONFIG.SIGILOPAY.SECRET_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';

    // Check for HTML response (e.g. Cloudflare / WAF block / 403 Forbidden)
    if (!contentType.includes('application/json')) {
      const textResponse = await response.text();
      return {
        success: false,
        error: {
          statusCode: response.status,
          errorCode: 'WAF_OR_NON_JSON_RESPONSE',
          message:
            response.status === 403
              ? 'Acesso bloqueado por WAF/Cloudflare da Sigilo Pay (verifique IP de origem ou credenciais).'
              : `Resposta não-JSON da Sigilo Pay (HTTP ${response.status}).`,
          details: textResponse.slice(0, 300),
        },
      };
    }

    const json = (await response.json()) as any;

    if (!response.ok) {
      const errCode =
        json.errorCode ||
        json.error?.code ||
        (response.status === 429 ? 'TOO_MANY_REQUESTS' : 'API_ERROR');
      const errMsg =
        json.message ||
        json.error?.message ||
        (Array.isArray(json.errors) ? json.errors.map((e: any) => e.message || e).join(', ') : null) ||
        `Erro retornado pelo gateway (HTTP ${response.status})`;

      return {
        success: false,
        error: {
          statusCode: response.status,
          errorCode: errCode,
          message: errMsg,
          details: json.details || json.errors,
        },
      };
    }

    // Normaliza os dados de resposta
    const transactionId = String(json.transactionId || json.id || '');
    const webhookToken = String(json.webhookToken || json.token || '');
    const pixCode = json.pix?.code || json.pixCode || '';
    const pixImage = json.pix?.image || undefined;
    const expiresAt = json.pix?.expiresAt || json.expiresAt || undefined;
    const operationalStatus = json.status || 'OK';
    const transactionStatus = json.transactionStatus || 'WAITING_PAYMENT';

    if (!pixCode) {
      return {
        success: false,
        error: {
          statusCode: 502,
          errorCode: 'MISSING_PIX_CODE',
          message: 'A Sigilo Pay não retornou o código Pix copia e cola na resposta.',
        },
      };
    }

    return {
      success: true,
      data: {
        transactionId,
        status: operationalStatus,
        transactionStatus,
        webhookToken,
        pix: {
          code: pixCode,
          image: pixImage,
          expiresAt,
        },
      },
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: {
          statusCode: 504,
          errorCode: 'GATEWAY_TIMEOUT',
          message: 'Timeout ao conectar com a API da Sigilo Pay. O gateway demorou mais de 15s para responder.',
        },
      };
    }

    return {
      success: false,
      error: {
        statusCode: 500,
        errorCode: 'NETWORK_ERROR',
        message: `Falha de rede ao conectar com Sigilo Pay: ${err.message || 'Erro desconhecido'}`,
      },
    };
  }
}

/**
 * Comparação segura de tokens com timingSafeEqual para evitar ataques de timing.
 */
export function secureCompareTokens(tokenA: string, tokenB: string): boolean {
  if (!tokenA || !tokenB) return false;
  const bufA = Buffer.from(tokenA);
  const bufB = Buffer.from(tokenB);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
