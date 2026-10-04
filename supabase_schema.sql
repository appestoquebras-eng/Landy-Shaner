-- Script SQL para criar a tabela de pedidos no Supabase
-- Execute este script no SQL Editor do seu painel Supabase:

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT NOT NULL,
    customer_cpf TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    street TEXT NOT NULL,
    house_number TEXT NOT NULL,
    complement TEXT,
    district TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    include_cream BOOLEAN NOT NULL DEFAULT FALSE,
    total_price NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'pix',
    status TEXT NOT NULL DEFAULT 'pending',
    pix_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ativar RLS (Row Level Security) e permitir inserções anônimas de novos pedidos
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir insercao anonima de pedidos"
ON public.orders
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Permitir leitura anonima de pedidos por ID"
ON public.orders
FOR SELECT
TO anon
USING (true);
