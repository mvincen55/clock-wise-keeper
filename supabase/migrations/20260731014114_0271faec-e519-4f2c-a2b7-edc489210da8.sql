-- Migration mirror reconciliation (audit item 4.8).
--
-- These objects existed only in the live database: they were created outside
-- the migration chain, so a fresh reset produced a schema the app could not
-- run against. This migration is the authoritative, additive mirror of live.
-- It is fully idempotent — on the live database every statement is a no-op;
-- on a fresh project it recreates the objects exactly.
-- Introspected from live on 2026-07-31.

-- ---------------------------------------------------------------- goal_events
CREATE TABLE IF NOT EXISTS public.goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  type text NOT NULL,
  reason text NOT NULL,
  old_title text NOT NULL,
  new_title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.goal_events
    ADD CONSTRAINT goal_events_type_check
    CHECK (type = ANY (ARRAY['edited','archived','replaced']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS goal_events_org_created_idx ON public.goal_events (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS goal_events_goal_idx ON public.goal_events (goal_id);

GRANT SELECT, INSERT, UPDATE ON public.goal_events TO authenticated;
GRANT ALL ON public.goal_events TO service_role;
ALTER TABLE public.goal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View goal events like the parent goal" ON public.goal_events;
CREATE POLICY "View goal events like the parent goal" ON public.goal_events
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id) AND EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_events.goal_id
        AND (g.visibility = 'team' OR g.user_id = auth.uid() OR public.is_org_admin(g.org_id))
    )
  );

DROP POLICY IF EXISTS "Members record events on their own goals" ON public.goal_events;
CREATE POLICY "Members record events on their own goals" ON public.goal_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_events.goal_id AND g.user_id = auth.uid() AND g.org_id = goal_events.org_id
    )
  );

DROP POLICY IF EXISTS "Members link replacements on their own events" ON public.goal_events;
CREATE POLICY "Members link replacements on their own events" ON public.goal_events
  FOR UPDATE TO authenticated
  USING (actor_id = auth.uid())
  WITH CHECK (actor_id = auth.uid());

DROP TRIGGER IF EXISTS enforce_goal_event_reason_ins ON public.goal_events;
CREATE TRIGGER enforce_goal_event_reason_ins
  BEFORE INSERT ON public.goal_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_goal_event_reason();

-- ------------------------------------------------------- messaging: the tables
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text,
  audience text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_type_check
    CHECK (type = ANY (ARRAY['dm','group','announcement','ai']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.conversations ADD CONSTRAINT conversations_audience_check
    CHECK (audience IS NULL OR audience = ANY (ARRAY['all','clinical','clerical']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_org ON public.conversations (org_id, type);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_participants_user ON public.conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv ON public.conversation_participants (conversation_id);
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx ON public.conversation_participants (user_id, conversation_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid,
  sender_kind text NOT NULL DEFAULT 'member',
  content text NOT NULL,
  reported_at timestamptz,
  reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.messages ADD CONSTRAINT messages_sender_kind_check
    CHECK (sender_kind = ANY (ARRAY['member','pathfinder','system']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON public.messages (conversation_id, created_at DESC);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS messages_content_trgm_idx ON public.messages USING gin (content gin_trgm_ops);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.conversation_participants TO service_role;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Participation is decided by security-definer helpers so the policies on
-- these three tables cannot recurse into each other.
DROP POLICY IF EXISTS "Read conversations you are in" ON public.conversations;
CREATE POLICY "Read conversations you are in" ON public.conversations
  FOR SELECT TO authenticated USING (public.can_read_conv(id));

DROP POLICY IF EXISTS "Create conversations in your org" ON public.conversations;
CREATE POLICY "Create conversations in your org" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND public.is_org_member(org_id)
    AND (type <> 'announcement' OR public.is_org_admin(org_id))
  );

DROP POLICY IF EXISTS "Creator updates own conversation" ON public.conversations;
CREATE POLICY "Creator updates own conversation" ON public.conversations
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "Read participants of your conversations" ON public.conversation_participants;
CREATE POLICY "Read participants of your conversations" ON public.conversation_participants
  FOR SELECT TO authenticated USING (public.can_read_conv(conversation_id));

DROP POLICY IF EXISTS "Add participants you may add" ON public.conversation_participants;
CREATE POLICY "Add participants you may add" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id)
    AND public.conv_type(conversation_id) <> 'ai'
    AND (
      (user_id = auth.uid() AND public.can_read_conv(conversation_id))
      OR public.conv_created_by(conversation_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update your own participant row" ON public.conversation_participants;
CREATE POLICY "Update your own participant row" ON public.conversation_participants
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Leave a conversation" ON public.conversation_participants;
CREATE POLICY "Leave a conversation" ON public.conversation_participants
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Owners see a message only once it has been reported to them: the secrecy
-- promise holds everywhere else.
DROP POLICY IF EXISTS "Read messages in your conversations" ON public.messages;
CREATE POLICY "Read messages in your conversations" ON public.messages
  FOR SELECT TO authenticated
  USING (public.can_read_conv(conversation_id) OR (reported_at IS NOT NULL AND public.is_org_owner(org_id)));

DROP POLICY IF EXISTS "Send messages where allowed" ON public.messages;
CREATE POLICY "Send messages where allowed" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND sender_kind = 'member' AND reported_at IS NULL
    AND (
      (public.conv_type(conversation_id) = ANY (ARRAY['dm','group','ai']) AND public.is_conv_participant(conversation_id))
      OR (public.conv_type(conversation_id) = 'announcement' AND public.is_org_admin(org_id))
    )
  );

DROP POLICY IF EXISTS "Report a message you can read" ON public.messages;
CREATE POLICY "Report a message you can read" ON public.messages
  FOR UPDATE TO authenticated
  USING (public.can_read_conv(conversation_id)) WITH CHECK (public.can_read_conv(conversation_id));

DROP POLICY IF EXISTS "Delete your own message" ON public.messages;
CREATE POLICY "Delete your own message" ON public.messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid() AND reported_at IS NULL);

DROP TRIGGER IF EXISTS conversations_updated_at ON public.conversations;
CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS guard_message_update_trg ON public.messages;
CREATE TRIGGER guard_message_update_trg BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();

DROP TRIGGER IF EXISTS notify_new_message_trg ON public.messages;
CREATE TRIGGER notify_new_message_trg AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- ----------------------------------------------------------- security_events
CREATE TABLE IF NOT EXISTS public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  actor_user_id uuid,
  kind text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'watch',
  status text NOT NULL DEFAULT 'open',
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);

DO $$ BEGIN
  ALTER TABLE public.security_events ADD CONSTRAINT security_events_kind_check
    CHECK (kind = ANY (ARRAY['auth_abuse','function_abuse','ai_jailbreak','time_anomaly','deposit_discrepancy','destructive_action']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.security_events ADD CONSTRAINT security_events_severity_check
    CHECK (severity = ANY (ARRAY['watch','elevated']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.security_events ADD CONSTRAINT security_events_status_check
    CHECK (status = ANY (ARRAY['open','reviewed','dismissed']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS security_events_live_fingerprint_idx
  ON public.security_events (org_id, fingerprint) WHERE status <> 'reviewed';
CREATE INDEX IF NOT EXISTS security_events_org_created_idx
  ON public.security_events (org_id, created_at DESC);

-- Only the service role writes integrity events; clients may read and review,
-- never insert or delete.
GRANT SELECT, UPDATE ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read integrity events that are not about them" ON public.security_events;
CREATE POLICY "Admins read integrity events that are not about them" ON public.security_events
  FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) AND (actor_user_id IS NULL OR actor_user_id <> auth.uid()));

DROP POLICY IF EXISTS "Admins review integrity events that are not about them" ON public.security_events;
CREATE POLICY "Admins review integrity events that are not about them" ON public.security_events
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id) AND (actor_user_id IS NULL OR actor_user_id <> auth.uid()))
  WITH CHECK (public.is_org_admin(org_id) AND (actor_user_id IS NULL OR actor_user_id <> auth.uid()));

-- ----------------------------------------------------------------- user_notes
CREATE TABLE IF NOT EXISTS public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'plum',
  sort_order integer NOT NULL DEFAULT 0,
  order_rev integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notes_user_sort_idx ON public.user_notes (user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notes TO authenticated;
GRANT ALL ON public.user_notes TO service_role;
ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

-- Strictly owner-only: not even an owner or manager reads someone's notes.
DROP POLICY IF EXISTS "Notes are visible only to their author" ON public.user_notes;
CREATE POLICY "Notes are visible only to their author" ON public.user_notes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Authors create their own notes" ON public.user_notes;
CREATE POLICY "Authors create their own notes" ON public.user_notes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS "Authors update their own notes" ON public.user_notes;
CREATE POLICY "Authors update their own notes" ON public.user_notes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Authors delete their own notes" ON public.user_notes;
CREATE POLICY "Authors delete their own notes" ON public.user_notes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_user_notes_updated_at ON public.user_notes;
CREATE TRIGGER update_user_notes_updated_at BEFORE UPDATE ON public.user_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------- employees.team
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS team text;