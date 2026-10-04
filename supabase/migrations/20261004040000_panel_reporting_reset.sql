ALTER TABLE public.store_panel_config ADD COLUMN IF NOT EXISTS reset_at timestamptz NOT NULL DEFAULT '-infinity';
CREATE OR REPLACE FUNCTION public.store_panel_stats(p_days integer) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH boundary AS (SELECT greatest(coalesce((SELECT reset_at FROM public.store_panel_config WHERE id=true),'-infinity'::timestamptz), CASE WHEN p_days=0 THEN '-infinity'::timestamptz ELSE
 (((now() AT TIME ZONE 'America/Sao_Paulo')::date-(greatest(1,least(p_days,30))-1))::timestamp AT TIME ZONE 'America/Sao_Paulo') END) AS start_at),
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
-- A returning visitor can be counted again after the store resets its reporting period.
CREATE OR REPLACE FUNCTION public.store_visit_after_reset() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.store_events SET created_at=now()
 WHERE visitor=NEW.visitor AND event=NEW.event AND event_day=NEW.event_day
   AND created_at<(SELECT reset_at FROM public.store_panel_config WHERE id=true);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS store_visit_reset ON public.store_events;
CREATE TRIGGER store_visit_reset BEFORE INSERT ON public.store_events FOR EACH ROW EXECUTE FUNCTION public.store_visit_after_reset();
REVOKE ALL ON FUNCTION public.store_visit_after_reset() FROM PUBLIC,anon,authenticated;
