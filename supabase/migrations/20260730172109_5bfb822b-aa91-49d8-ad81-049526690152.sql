CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS messages_content_trgm_idx ON public.messages USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx ON public.conversation_participants (user_id, conversation_id);