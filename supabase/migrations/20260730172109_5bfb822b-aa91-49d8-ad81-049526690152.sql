CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Replay repair: the messaging tables reached production before their
-- migration files existed — 20260731014114 (the next day) creates the tables
-- and re-issues these same indexes with IF NOT EXISTS. On a clean-database
-- replay the tables do not exist yet at this point, so only build the indexes
-- when they do. Harmless on the live ledger — this migration never re-runs
-- where it was already applied.
DO $$
BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS messages_content_trgm_idx ON public.messages USING gin (content gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages (conversation_id, created_at DESC);
  END IF;
  IF to_regclass('public.conversation_participants') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS conversation_participants_user_idx ON public.conversation_participants (user_id, conversation_id);
  END IF;
END;
$$;