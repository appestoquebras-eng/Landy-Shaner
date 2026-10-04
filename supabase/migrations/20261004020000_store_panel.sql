CREATE TABLE IF NOT EXISTS public.store_events (
 visitor uuid NOT NULL, event text NOT NULL CHECK(event IN ('visit','checkout')),
 event_day date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(visitor,event,event_day)
);
CREATE TABLE IF NOT EXISTS public.store_pix_copies (
 order_id text PRIMARY KEY REFERENCES public.orders(order_id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.store_panel_config (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), password_hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.store_panel_attempts (
 ip_hash text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE public.store_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_pix_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_panel_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_panel_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_events,public.store_pix_copies,public.store_panel_config,public.store_panel_attempts FROM anon,authenticated;
GRANT ALL ON public.store_events,public.store_pix_copies,public.store_panel_config,public.store_panel_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.store_panel_login(p_ip_hash text,p_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$
DECLARE a public.store_panel_attempts;
BEGIN
 INSERT INTO store_panel_attempts(ip_hash,attempts) VALUES(p_ip_hash,0) ON CONFLICT DO NOTHING;
 SELECT * INTO a FROM store_panel_attempts WHERE ip_hash=p_ip_hash FOR UPDATE;
 IF a.window_start < now()-interval '15 minutes' THEN
   UPDATE store_panel_attempts SET attempts=0,window_start=now() WHERE ip_hash=p_ip_hash; a.attempts:=0;
 END IF;
 IF a.attempts>=5 THEN RETURN false; END IF;
 UPDATE store_panel_attempts SET attempts=attempts+1 WHERE ip_hash=p_ip_hash;
 IF EXISTS(SELECT 1 FROM store_panel_config WHERE password_hash=crypt(p_password,password_hash)) THEN
   UPDATE store_panel_attempts SET attempts=0 WHERE ip_hash=p_ip_hash; RETURN true;
 END IF;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION public.store_panel_stats(p_days integer) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH boundary AS (SELECT CASE WHEN p_days=0 THEN '-infinity'::timestamptz ELSE
 (((now() AT TIME ZONE 'America/Sao_Paulo')::date-(greatest(1,least(p_days,30))-1))::timestamp AT TIME ZONE 'America/Sao_Paulo') END AS start_at),
 selected AS (SELECT o.* FROM orders o,boundary b WHERE o.created_at>=b.start_at)
 SELECT jsonb_build_object(
  'visit',(SELECT count(DISTINCT visitor) FROM store_events,boundary WHERE event='visit' AND created_at>=start_at),
  'checkout',(SELECT count(DISTINCT visitor) FROM store_events,boundary WHERE event='checkout' AND created_at>=start_at),
  'pix',(SELECT count(*) FROM selected WHERE pix_code IS NOT NULL AND pix_code<>''),
  'copy',(SELECT count(*) FROM store_pix_copies c JOIN selected o USING(order_id)),
  'paid',(SELECT count(*) FROM selected WHERE status='paid'),
  'revenue',(SELECT coalesce(sum(total_price),0) FROM selected WHERE status='paid'),
  'orders',coalesce((SELECT jsonb_agg(x) FROM (SELECT order_id,created_at,total_price,status FROM selected ORDER BY created_at DESC LIMIT 50)x),'[]'::jsonb)
 );
$$;
REVOKE ALL ON FUNCTION public.store_panel_login(text,text),public.store_panel_stats(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_panel_login(text,text),public.store_panel_stats(integer) TO service_role;
