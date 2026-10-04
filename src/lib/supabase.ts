/**
 * Cliente Supabase para operações de frontend públicas se necessárias.
 * Observação de Segurança:
 * Toda gravação e atualização de pedidos e pagamentos é realizada estritamente pelo servidor
 * via service_role em /server/db.ts, com Row Level Security (RLS) habilitado.
 * Nenhum dado pessoal sensível ou confirmação de pagamento é permitido via chave anônima ou localStorage.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
