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

-- Replay repair: the messaging feature's helper functions reached production
-- through platform edits that never became migration files, yet the policies
-- and triggers below depend on them. Definitions match production
-- (pg_get_functiondef). Content-only edit to an applied migration — the live
-- ledger never re-runs it.
CREATE OR REPLACE FUNCTION public.my_team()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT e.team FROM public.employees e WHERE e.user_id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_conv_participant(_conv uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants p
    WHERE p.conversation_id = _conv AND p.user_id = auth.uid()
  );
$function$;

CREATE OR REPLACE FUNCTION public.conv_type(_conv uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.type FROM public.conversations c WHERE c.id = _conv;
$function$;

CREATE OR REPLACE FUNCTION public.conv_created_by(_conv uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.created_by FROM public.conversations c WHERE c.id = _conv;
$function$;

CREATE OR REPLACE FUNCTION public.can_read_conv(_conv uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conv
      AND (
        public.is_conv_participant(c.id)
        OR (
          c.type = 'announcement'
          AND public.is_org_member(c.org_id)
          AND (c.audience = 'all' OR c.audience IS NULL OR c.audience = public.my_team())
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.sender_kind IS DISTINCT FROM OLD.sender_kind
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Messages cannot be edited';
  END IF;
  IF OLD.reported_at IS NOT NULL AND NEW.reported_at IS DISTINCT FROM OLD.reported_at THEN
    RAISE EXCEPTION 'A reported message cannot be un-reported';
  END IF;
  IF NEW.reported_at IS NOT NULL THEN
    NEW.reported_by := auth.uid();
    NEW.reported_at := now();
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_conv public.conversations;
  v_name text;
  v_title text;
  v_preview text;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;

  v_preview := left(regexp_replace(NEW.content, '\s+', ' ', 'g'), 140);

  IF NEW.sender_kind = 'pathfinder' THEN
    v_name := 'Office AI';
  ELSE
    SELECT e.display_name INTO v_name FROM public.employees e WHERE e.user_id = NEW.sender_id LIMIT 1;
    v_name := COALESCE(v_name, 'A teammate');
  END IF;

  IF v_conv.type = 'announcement' THEN
    v_title := 'Announcement: ' || COALESCE(v_conv.title, 'Team update');
    INSERT INTO public.notifications (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
    SELECT v_conv.org_id, m.user_id, NEW.sender_id, 'message', v_title, v_preview, 'conversations', v_conv.id
    FROM public.org_members m
    LEFT JOIN public.employees e ON e.user_id = m.user_id AND e.org_id = m.org_id
    WHERE m.org_id = v_conv.org_id AND m.status = 'active'
      AND m.user_id IS DISTINCT FROM NEW.sender_id
      AND (v_conv.audience = 'all' OR v_conv.audience IS NULL OR e.team = v_conv.audience);
  ELSE
    v_title := CASE WHEN v_conv.type = 'ai' THEN 'Office AI' ELSE 'New message from ' || v_name END;
    INSERT INTO public.notifications (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
    SELECT v_conv.org_id, p.user_id, NEW.sender_id, 'message', v_title, v_preview, 'conversations', v_conv.id
    FROM public.conversation_participants p
    WHERE p.conversation_id = v_conv.id AND p.user_id IS DISTINCT FROM NEW.sender_id;
  END IF;

  RETURN NEW;
END;
$function$;

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

-- Replay repair: message_attachments (20260730172500) predates the messaging
-- tables above in file order, so that migration now no-ops on a clean replay
-- and the same objects are (re)created here, idempotently, once their
-- prerequisites exist. Identical end state to production.
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_attachments_mime_allowed CHECK (
    mime_type IN ('image/png','image/jpeg','image/webp','image/gif','application/pdf')
  ),
  CONSTRAINT message_attachments_size_limit CHECK (size_bytes > 0 AND size_bytes <= 20971520)
);

GRANT SELECT, INSERT, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read conversation attachments" ON public.message_attachments;
CREATE POLICY "Participants read conversation attachments"
ON public.message_attachments FOR SELECT TO authenticated
USING (public.is_conv_participant(conversation_id));

DROP POLICY IF EXISTS "Participants add their own attachments" ON public.message_attachments;
CREATE POLICY "Participants add their own attachments"
ON public.message_attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND public.is_conv_participant(conversation_id)
  AND storage_path = org_id::text || '/' || conversation_id::text || '/' || split_part(storage_path, '/', 3)
);

DROP POLICY IF EXISTS "Uploader deletes own attachment" ON public.message_attachments;
CREATE POLICY "Uploader deletes own attachment"
ON public.message_attachments FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() AND public.is_conv_participant(conversation_id));

CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_conversation ON public.message_attachments(conversation_id);

DROP TRIGGER IF EXISTS update_message_attachments_updated_at ON public.message_attachments;
CREATE TRIGGER update_message_attachments_updated_at
BEFORE UPDATE ON public.message_attachments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Participants read message files" ON storage.objects;
CREATE POLICY "Participants read message files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND public.is_conv_participant(((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Participants upload message files" ON storage.objects;
CREATE POLICY "Participants upload message files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message-attachments'
  AND owner = auth.uid()
  AND array_length(storage.foldername(name), 1) = 2
  AND public.is_conv_participant(((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Uploader deletes message files" ON storage.objects;
CREATE POLICY "Uploader deletes message files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'message-attachments'
  AND owner = auth.uid()
  AND public.is_conv_participant(((storage.foldername(name))[2])::uuid)
);
