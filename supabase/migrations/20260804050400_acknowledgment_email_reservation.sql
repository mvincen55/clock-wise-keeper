-- Reserve each acknowledgment email message_id while it is pending or sent.
-- Failed attempts remain outside the partial index so the same deterministic
-- message_id may be retried safely.

WITH ranked AS (
  SELECT
    id,
    status,
    row_number() OVER (
      PARTITION BY message_id
      ORDER BY
        CASE status WHEN 'sent' THEN 0 ELSE 1 END,
        created_at,
        id
    ) AS position
  FROM public.email_send_log
  WHERE message_id IS NOT NULL
    AND status IN ('pending', 'sent')
)
UPDATE public.email_send_log log
SET status = 'failed',
    error_message = COALESCE(
      log.error_message,
      'Duplicate pending reservation closed before acknowledgment email idempotency index was added.'
    )
FROM ranked
WHERE ranked.id = log.id
  AND ranked.position > 1
  AND log.status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_active_unique
  ON public.email_send_log(message_id)
  WHERE message_id IS NOT NULL
    AND status IN ('pending', 'sent');

COMMENT ON INDEX public.idx_email_send_log_message_active_unique IS
  'Prevents concurrent workers from reserving the same pending or sent email message_id; failed rows remain retryable.';
