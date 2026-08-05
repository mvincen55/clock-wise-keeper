-- The office-pulse and accountability jobs previously identified themselves with
-- the public anon key (or a spoofable "cron" header). Both functions now require
-- the service-role bearer, so the schedules must present it.
-- Replay repair: cron.unschedule() raises when the job does not exist, and on
-- a clean database none of these were ever scheduled (they were created in
-- production at runtime). Guarded like 20260610183740's sweep job.
DO $$
DECLARE
  v_job text;
BEGIN
  FOREACH v_job IN ARRAY ARRAY['office-pulse-daily','accountability-daily','accountability-sweep'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job) THEN
      PERFORM cron.unschedule(v_job);
    END IF;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'office-pulse-daily',
  '30 13 * * *',
  $$
  select net.http_post(
    url := 'https://lfiplzmxpmybtbzhmnkp.supabase.co/functions/v1/office-pulse',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('time', now())
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'accountability-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://lfiplzmxpmybtbzhmnkp.supabase.co/functions/v1/accountability-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('action', 'scan')
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'accountability-sweep',
  '30 13 * * *',
  $$
  select net.http_post(
    url := 'https://lfiplzmxpmybtbzhmnkp.supabase.co/functions/v1/accountability-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('action', 'sweep')
  ) as request_id;
  $$
);