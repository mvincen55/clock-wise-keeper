
-- 1. employees.team
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS team text
  CHECK (team IS NULL OR team IN ('clinical','clerical'));

-- 2. helper: org owner
CREATE OR REPLACE FUNCTION public.is_org_owner(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid()
      AND status = 'active' AND role = 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_team()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.team FROM public.employees e WHERE e.user_id = auth.uid() LIMIT 1;
$$;

-- 3. tables
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('dm','group','announcement','ai')),
  title text,
  audience text CHECK (audience IS NULL OR audience IN ('all','clinical','clerical')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid,
  sender_kind text NOT NULL DEFAULT 'member' CHECK (sender_kind IN ('member','pathfinder','system')),
  content text NOT NULL,
  reported_at timestamptz,
  reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conv_participants_user ON public.conversation_participants(user_id);
CREATE INDEX idx_conv_participants_conv ON public.conversation_participants(conversation_id);
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_org ON public.conversations(org_id, type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- 4. conversation helpers (definer, avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_conv_participant(_conv uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants p
    WHERE p.conversation_id = _conv AND p.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.conv_type(_conv uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.type FROM public.conversations c WHERE c.id = _conv;
$$;

CREATE OR REPLACE FUNCTION public.conv_created_by(_conv uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.created_by FROM public.conversations c WHERE c.id = _conv;
$$;

-- Announcements are readable by their audience; everything else is
-- participants only. There is deliberately NO admin override.
CREATE OR REPLACE FUNCTION public.can_read_conv(_conv uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;

-- 5. RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read conversations you are in"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.can_read_conv(id));

CREATE POLICY "Create conversations in your org"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_org_member(org_id)
    AND (type <> 'announcement' OR public.is_org_admin(org_id))
  );

CREATE POLICY "Creator updates own conversation"
  ON public.conversations FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "Read participants of your conversations"
  ON public.conversation_participants FOR SELECT TO authenticated
  USING (public.can_read_conv(conversation_id));

CREATE POLICY "Add participants you may add"
  ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id)
    AND public.conv_type(conversation_id) <> 'ai'
    AND (
      (user_id = auth.uid() AND public.can_read_conv(conversation_id))
      OR public.conv_created_by(conversation_id) = auth.uid()
    )
  );

CREATE POLICY "Update your own participant row"
  ON public.conversation_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Leave a conversation"
  ON public.conversation_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Messages: participants only. The single exception is a message a recipient
-- has explicitly reported, which becomes visible to org owners.
CREATE POLICY "Read messages in your conversations"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.can_read_conv(conversation_id)
    OR (reported_at IS NOT NULL AND public.is_org_owner(org_id))
  );

CREATE POLICY "Send messages where allowed"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND sender_kind = 'member'
    AND reported_at IS NULL
    AND (
      (public.conv_type(conversation_id) IN ('dm','group','ai') AND public.is_conv_participant(conversation_id))
      OR (public.conv_type(conversation_id) = 'announcement' AND public.is_org_admin(org_id))
    )
  );

CREATE POLICY "Delete your own message"
  ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() AND reported_at IS NULL);

-- reporting only, enforced by trigger below
CREATE POLICY "Report a message you can read"
  ON public.messages FOR UPDATE TO authenticated
  USING (public.can_read_conv(conversation_id))
  WITH CHECK (public.can_read_conv(conversation_id));

CREATE OR REPLACE FUNCTION public.guard_message_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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
$$;

CREATE TRIGGER guard_message_update_trg
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_message_update();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. notify recipients of new messages
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE TRIGGER notify_new_message_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

-- 7. RPCs
CREATE OR REPLACE FUNCTION public.ensure_ai_conversation()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  SELECT org_id INTO v_org FROM public.org_members
   WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;

  SELECT c.id INTO v_id
    FROM public.conversations c
    JOIN public.conversation_participants p ON p.conversation_id = c.id
   WHERE c.type = 'ai' AND c.org_id = v_org AND p.user_id = auth.uid()
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.conversations (org_id, type, title, created_by)
  VALUES (v_org, 'ai', 'Office AI', auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.conversation_participants (org_id, conversation_id, user_id)
  VALUES (v_org, v_id, auth.uid());

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_dm(_other_user uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_id uuid;
BEGIN
  IF _other_user = auth.uid() THEN RAISE EXCEPTION 'Pick a teammate'; END IF;

  SELECT org_id INTO v_org FROM public.org_members
   WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'No active organization'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = v_org AND user_id = _other_user AND status = 'active'
  ) THEN RAISE EXCEPTION 'That person is not on your team'; END IF;

  SELECT c.id INTO v_id
    FROM public.conversations c
   WHERE c.type = 'dm' AND c.org_id = v_org
     AND (SELECT count(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
     AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id = c.id AND p.user_id = _other_user)
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.conversations (org_id, type, created_by)
  VALUES (v_org, 'dm', auth.uid()) RETURNING id INTO v_id;

  INSERT INTO public.conversation_participants (org_id, conversation_id, user_id)
  VALUES (v_org, v_id, auth.uid()), (v_org, v_id, _other_user);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conv uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  IF NOT public.can_read_conv(_conv) THEN RAISE EXCEPTION 'Not your conversation'; END IF;
  SELECT org_id INTO v_org FROM public.conversations WHERE id = _conv;
  INSERT INTO public.conversation_participants (org_id, conversation_id, user_id, last_read_at)
  VALUES (v_org, _conv, auth.uid(), now())
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.report_message(_message_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.messages;
BEGIN
  SELECT * INTO m FROM public.messages WHERE id = _message_id;
  IF m.id IS NULL OR NOT public.can_read_conv(m.conversation_id) THEN
    RAISE EXCEPTION 'Not your conversation';
  END IF;

  UPDATE public.messages
     SET reported_at = now(), reported_by = auth.uid()
   WHERE id = _message_id AND reported_at IS NULL;

  INSERT INTO public.notifications (org_id, recipient_user_id, actor_user_id, notification_type, title, message, related_table, related_id)
  SELECT m.org_id, om.user_id, auth.uid(), 'message_reported',
         'A message was reported to you',
         COALESCE(NULLIF(btrim(_note), ''), left(m.content, 180)),
         'messages', m.id
  FROM public.org_members om
  WHERE om.org_id = m.org_id AND om.status = 'active' AND om.role = 'owner';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_ai_conversation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_dm(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.report_message(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_conv(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_conv_participant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conv_type(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conv_created_by(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_team() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_owner(uuid) FROM anon;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
