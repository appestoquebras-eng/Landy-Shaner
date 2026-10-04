-- Consent and durable Purchase delivery. No historical purchases are backfilled.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meta_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meta_context jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS public.meta_outbox (
 event_id text PRIMARY KEY, order_id text NOT NULL REFERENCES public.orders(order_id),
 payload jsonb NOT NULL, state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 next_attempt timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_id uuid,
 last_code text, sent_at timestamptz
);
ALTER TABLE public.meta_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_outbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.meta_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.meta_capture_purchase() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.meta_consent THEN
  INSERT INTO public.meta_outbox(event_id,order_id,payload) VALUES ('purchase_'||NEW.order_id,NEW.order_id,
   jsonb_build_object('event_name','Purchase','event_id','purchase_'||NEW.order_id,
    'event_time',floor(extract(epoch FROM coalesce(NEW.paid_at,now()))),
    'action_source','website','event_source_url','https://landy-shaner.pages.dev/',
    'user_data',NEW.meta_context,'custom_data',jsonb_build_object('currency','BRL',
      'value',NEW.amount_cents/100.0,'order_id',NEW.order_id,'content_type','product',
      'content_ids',CASE WHEN NEW.include_cream THEN '["kit-depilador","clareador"]'::jsonb ELSE '["kit-depilador"]'::jsonb END,
      'contents',jsonb_build_array(jsonb_build_object('id','kit-depilador','quantity',NEW.quantity,'item_price',34.90)) ||
       CASE WHEN NEW.include_cream THEN jsonb_build_array(jsonb_build_object('id','clareador','quantity',1,'item_price',15.00)) ELSE '[]'::jsonb END)))
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS meta_purchase_outbox ON public.orders;
CREATE TRIGGER meta_purchase_outbox AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.meta_capture_purchase();

CREATE OR REPLACE FUNCTION public.meta_set_context(p_order_id text,p_guest_hash text,p_consent boolean,p_context jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE found_order public.orders;
BEGIN
 SELECT * INTO found_order FROM public.orders WHERE order_id=p_order_id AND guest_token_hash=p_guest_hash FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Context is frozen when paid; withdrawal remains possible.
 UPDATE public.orders SET meta_consent=p_consent,
  meta_context=CASE WHEN status IN ('creating','uncertain','pending') AND p_consent THEN p_context WHEN NOT p_consent THEN '{}'::jsonb ELSE meta_context END
  WHERE order_id=p_order_id;
 IF NOT p_consent THEN UPDATE public.meta_outbox SET state='canceled',payload='{}' WHERE order_id=p_order_id AND state<>'sent'; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.meta_claim_batch() RETURNS SETOF public.meta_outbox
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.meta_outbox SET state='sending',lease_until=now()+interval '2 minutes',lease_id=gen_random_uuid(),attempts=attempts+1
 WHERE event_id IN (SELECT b.event_id FROM public.meta_outbox b JOIN public.orders o USING(order_id)
  WHERE o.meta_consent AND o.status='paid' AND b.next_attempt<=now()
   AND (b.state='pending' OR (b.state='sending' AND b.lease_until<now()))
  ORDER BY b.next_attempt FOR UPDATE OF b SKIP LOCKED LIMIT 10)
 RETURNING *;
$$;
CREATE OR REPLACE FUNCTION public.meta_finish(p_event_id text,p_lease_id uuid,p_result text,p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.meta_outbox SET state=p_result,last_code=left(p_code,40),lease_until=NULL,
  sent_at=CASE WHEN p_result='sent' THEN now() ELSE NULL END,
  next_attempt=now()+make_interval(secs=>least(3600,(30*power(2,least(attempts,7)))::integer))
 WHERE event_id=p_event_id AND lease_id=p_lease_id AND state='sending';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.meta_capture_purchase(),public.meta_set_context(text,text,boolean,jsonb),public.meta_claim_batch(),public.meta_finish(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_set_context(text,text,boolean,jsonb),public.meta_claim_batch(),public.meta_finish(text,uuid,text,text) TO service_role;
