-- Execute after saving an existing token in Vault as landy_meta_worker_token.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
SELECT cron.schedule('landy-meta-outbox','* * * * *', $job$
 SELECT net.http_post(
  url:='https://ojvznzupiojimykqryhw.supabase.co/functions/v1/checkout-api/meta/process',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='landy_meta_worker_token' LIMIT 1)),
  body:='{}'::jsonb,timeout_milliseconds:=100000)
 WHERE EXISTS(SELECT 1 FROM public.meta_outbox WHERE state IN ('pending','sending'))
 AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='landy_meta_worker_token');
 $job$);
