-- Historical compatibility marker.
--
-- This migration created message_attachments (table, RLS, indexes, trigger,
-- and the storage.objects policies for the message-attachments bucket), but
-- its prerequisites — the conversations/messages tables and
-- is_conv_participant() — reached production through platform edits whose
-- migration files carry the NEXT day's timestamp (20260731014114). Replaying
-- the repository from an empty database therefore failed here on the first
-- foreign key.
--
-- The identical objects are now (re)created idempotently at the end of
-- 20260731014114, once their prerequisites exist. Keep this timestamp in the
-- history so applied ledgers remain stable; on a clean replay this file is a
-- deliberate no-op.
DO $$
BEGIN
  RAISE NOTICE 'message_attachments objects are created by 20260731014114';
END;
$$;
