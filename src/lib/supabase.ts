import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface OrderRecord {
  id?: string;
  order_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  customer_cpf: string;
  postal_code: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  quantity: number;
  include_cream: boolean;
  total_price: number;
  payment_method: string;
  status: 'pending' | 'paid' | 'canceled';
  pix_code?: string;
  created_at?: string;
}

/**
 * Salva o pedido no Supabase (se configurado) e no localStorage como backup.
 */
export async function saveOrder(order: OrderRecord): Promise<{ success: boolean; error?: string }> {
  // Always save backup in localStorage
  try {
    const existing = JSON.parse(localStorage.getItem('landy_orders') || '[]');
    existing.unshift({ ...order, created_at: new Date().toISOString() });
    localStorage.setItem('landy_orders', JSON.stringify(existing.slice(0, 50)));
  } catch (err) {
    console.warn('Falha ao salvar backup local do pedido:', err);
  }

  // If Supabase is connected, insert into 'orders' table
  if (supabase) {
    try {
      const { error } = await supabase.from('orders').insert([
        {
          order_id: order.order_id,
          customer_name: order.customer_name,
          customer_email: order.customer_email || null,
          customer_phone: order.customer_phone,
          customer_cpf: order.customer_cpf,
          postal_code: order.postal_code,
          street: order.street,
          house_number: order.number,
          complement: order.complement || null,
          district: order.district,
          city: order.city,
          state: order.state,
          quantity: order.quantity,
          include_cream: order.include_cream,
          total_price: order.total_price,
          payment_method: order.payment_method,
          status: order.status,
          pix_code: order.pix_code || null,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.error('Erro ao salvar no Supabase:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Exceção ao inserir no Supabase:', msg);
      return { success: false, error: msg };
    }
  }

  return { success: true };
}
