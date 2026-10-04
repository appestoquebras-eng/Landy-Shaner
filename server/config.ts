import dotenv from 'dotenv';

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  SIGILOPAY: {
    BASE_URL: process.env.SIGILOPAY_BASE_URL || 'https://app.sigilopay.com.br/api/v1',
    PUBLIC_KEY: process.env.SIGILOPAY_PUBLIC_KEY || '',
    SECRET_KEY: process.env.SIGILOPAY_SECRET_KEY || '',
    CALLBACK_URL: process.env.SIGILOPAY_CALLBACK_URL || '',
  },
  SUPABASE: {
    URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  CATALOG: {
    KIT_ID: 'kit-depilador-4em1',
    KIT_NAME: 'Kit Depilador 4 em 1 Landy Shaner',
    KIT_PRICE_CENTS: 3490, // R$ 34,90
    CREAM_ID: 'creme-clareador-clear-beauty',
    CREAM_NAME: 'Creme Clareador Íntimo e Corporal Clear Beauty',
    CREAM_PRICE_CENTS: 1500, // R$ 15,00
    CURRENCY: 'BRL',
  },
};

export function isSigiloPayConfigured(): boolean {
  return Boolean(
    CONFIG.SIGILOPAY.PUBLIC_KEY &&
    CONFIG.SIGILOPAY.SECRET_KEY &&
    CONFIG.SIGILOPAY.CALLBACK_URL
  );
}

export function isSupabaseServiceConfigured(): boolean {
  return Boolean(CONFIG.SUPABASE.URL && CONFIG.SUPABASE.SERVICE_ROLE_KEY);
}

/**
 * Calcula o valor total em centavos e reais baseado no catálogo do servidor.
 */
export function calculateOrderAmounts(quantity: number, includeCream: boolean): {
  amountCents: number;
  amountReais: number;
  items: Array<{ id: string; name: string; quantity: number; price: number; physical: boolean }>;
} {
  const safeQty = Math.max(1, Math.floor(quantity || 1));
  const kitUnitCents = safeQty>=2?Math.round(CONFIG.CATALOG.KIT_PRICE_CENTS*0.9):CONFIG.CATALOG.KIT_PRICE_CENTS;
  const kitTotalCents = safeQty * kitUnitCents;
  const creamTotalCents = includeCream ? CONFIG.CATALOG.CREAM_PRICE_CENTS : 0;
  const amountCents = kitTotalCents + creamTotalCents;
  const amountReais = Number((amountCents / 100).toFixed(2));

  const items = [
    {
      id: CONFIG.CATALOG.KIT_ID,
      name: CONFIG.CATALOG.KIT_NAME,
      quantity: safeQty,
      price: Number((kitUnitCents / 100).toFixed(2)),
      physical: true,
    },
  ];

  if (includeCream) {
    items.push({
      id: CONFIG.CATALOG.CREAM_ID,
      name: CONFIG.CATALOG.CREAM_NAME,
      quantity: 1,
      price: Number((CONFIG.CATALOG.CREAM_PRICE_CENTS / 100).toFixed(2)),
      physical: true,
    });
  }

  return {
    amountCents,
    amountReais,
    items,
  };
}

export function sanitizeDigits(str: string | undefined | null): string {
  if (!str) return '';
  return str.replace(/\D/g, '');
}

