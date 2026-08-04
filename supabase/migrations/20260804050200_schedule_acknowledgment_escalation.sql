-- Run the routine acknowledgment escalation sweep hourly. The worker still
-- checks each recipient's actual work schedule, days off, call-outs, office
-- closures, and quiet hours before delivering anything.

DO $$
BEGIN
  PERFORM cron.unschedule('acknowledgment-escalation-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'acknowledgment-escalation-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://lfiplzmxpmybtbzhmnkp.supabase.co/functions/v1/acknowledgment-escalation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('time', now())
  ) as request_id;
  $$
);
