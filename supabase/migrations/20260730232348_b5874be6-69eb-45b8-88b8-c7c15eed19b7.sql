-- The office-pulse and accountability jobs previously identified themselves with
-- the public anon key (or a spoofable "cron" header). Both functions now require
-- the service-role bearer, so the schedules must present it.
SELECT cron.unschedule('office-pulse-daily');
SELECT cron.unschedule('accountability-daily');
SELECT cron.unschedule('accountability-sweep');

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