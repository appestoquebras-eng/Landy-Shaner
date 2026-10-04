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
      'contents',jsonb_build_array(jsonb_build_object('id','kit-depilador','quantity',NEW.quantity,'item_price',(NEW.amount_cents-CASE WHEN NEW.include_cream THEN 1500 ELSE 0 END)/100.0/NEW.quantity)) ||
       CASE WHEN NEW.include_cream THEN jsonb_build_array(jsonb_build_object('id','clareador','quantity',1,'item_price',15.00)) ELSE '[]'::jsonb END)))
  ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
