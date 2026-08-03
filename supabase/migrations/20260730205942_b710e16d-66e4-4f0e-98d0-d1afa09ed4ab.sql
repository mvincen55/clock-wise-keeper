-- ============================================================
-- Messaging, Doctor Requests & the Doctor's Board
-- ============================================================

-- ---------- Org-level settings ----------
CREATE TABLE public.org_messaging_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  messages_label text NOT NULL DEFAULT 'Messages',
  requests_label text NOT NULL DEFAULT 'Doctor Requests',
  categories text[] NOT NULL DEFAULT ARRAY[
    'Treatment question','Lab','Prescription','Callback','Financial','Scheduling','Other'
  ],
  retention_days integer NOT NULL DEFAULT 30,
  closeout_cutoff_minutes integer NOT NULL DEFAULT 30,
  closeout_item_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_messaging_settings TO authenticated;
GRANT ALL ON public.org_messaging_settings TO service_role;
ALTER TABLE public.org_messaging_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read messaging settings"
  ON public.org_messaging_settings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "admins write messaging settings"
  ON public.org_messaging_settings FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE TRIGGER org_messaging_settings_updated_at
  BEFORE UPDATE ON public.org_messaging_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Owner-only preferences ----------
CREATE TABLE public.owner_board_prefs (
  user_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  share_with_manager boolean NOT NULL DEFAULT false,
  digest_frequency text NOT NULL DEFAULT 'weekly'
    CHECK (digest_frequency IN ('daily','weekly','never')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_board_prefs TO authenticated;
GRANT ALL ON public.owner_board_prefs TO service_role;
ALTER TABLE public.owner_board_prefs ENABLE ROW LEVEL SECURITY;

-- The switch is the owner's alone: only he can read or flip it.
CREATE POLICY "owner manages own board prefs"
  ON public.owner_board_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_org_owner(org_id));

CREATE TRIGGER owner_board_prefs_updated_at
  BEFORE UPDATE ON public.owner_board_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Has this owner opened his list to the manager?
CREATE OR REPLACE FUNCTION public.board_shared_with_manager(_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.owner_board_prefs
    WHERE user_id = _owner_user_id AND share_with_manager
  )
$$;

REVOKE ALL ON FUNCTION public.board_shared_with_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.board_shared_with_manager(uuid) TO authenticated, service_role;

-- ---------- Requests (messages) ----------
CREATE TABLE public.office_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'Other',
  reference text,
  note text NOT NULL,
  needs_reply boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz,
  acknowledged_at timestamptz,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','seen','handled','replied','on_doctors_list','sent_to_manager')),
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX office_requests_recipient_idx ON public.office_requests (recipient_id, created_at DESC);
CREATE INDEX office_requests_sender_idx ON public.office_requests (sender_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_requests TO authenticated;
GRANT ALL ON public.office_requests TO service_role;
ALTER TABLE public.office_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read requests"
  ON public.office_requests FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "members send requests"
  ON public.office_requests FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_org_member(org_id));

CREATE POLICY "participants update requests"
  ON public.office_requests FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "participants delete requests"
  ON public.office_requests FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- first_seen_at is written once and never rewritten, and neither side may
-- rewrite history on a request they did not send.
CREATE OR REPLACE FUNCTION public.guard_office_request_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.first_seen_at IS NOT NULL THEN
    NEW.first_seen_at := OLD.first_seen_at;
  END IF;
  NEW.sender_id := OLD.sender_id;
  NEW.recipient_id := OLD.recipient_id;
  NEW.org_id := OLD.org_id;
  NEW.created_at := OLD.created_at;
  NEW.note := OLD.note;
  RETURN NEW;
END;
$$;

CREATE TRIGGER office_requests_guard
  BEFORE UPDATE ON public.office_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_office_request_update();

-- ---------- Replies ----------
CREATE TABLE public.office_request_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.office_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  first_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX office_request_replies_request_idx ON public.office_request_replies (request_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_request_replies TO authenticated;
GRANT ALL ON public.office_request_replies TO service_role;
ALTER TABLE public.office_request_replies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_request(_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.office_requests r
    WHERE r.id = _request_id
      AND (r.sender_id = auth.uid() OR r.recipient_id = auth.uid())
  )
$$;

REVOKE ALL ON FUNCTION public.can_access_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_request(uuid) TO authenticated, service_role;

CREATE POLICY "participants read replies"
  ON public.office_request_replies FOR SELECT TO authenticated
  USING (public.can_access_request(request_id));

CREATE POLICY "participants write replies"
  ON public.office_request_replies FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.can_access_request(request_id));

CREATE POLICY "participants stamp replies"
  ON public.office_request_replies FOR UPDATE TO authenticated
  USING (public.can_access_request(request_id))
  WITH CHECK (public.can_access_request(request_id));

CREATE OR REPLACE FUNCTION public.guard_request_reply_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.first_seen_at IS NOT NULL THEN
    NEW.first_seen_at := OLD.first_seen_at;
  END IF;
  NEW.body := OLD.body;
  NEW.sender_id := OLD.sender_id;
  NEW.request_id := OLD.request_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER office_request_replies_guard
  BEFORE UPDATE ON public.office_request_replies
  FOR EACH ROW EXECUTE FUNCTION public.guard_request_reply_update();

-- ---------- The doctor's board ----------
CREATE TABLE public.doctor_board_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  title text NOT NULL,
  note text,
  due_at timestamptz,
  repeat_rule text NOT NULL DEFAULT 'none'
    CHECK (repeat_rule IN ('none','daily','weekly','monthly')),
  source_request_id uuid REFERENCES public.office_requests(id) ON DELETE SET NULL,
  visible_to_manager boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX doctor_board_items_owner_idx ON public.doctor_board_items (owner_user_id, completed_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doctor_board_items TO authenticated;
GRANT ALL ON public.doctor_board_items TO service_role;
ALTER TABLE public.doctor_board_items ENABLE ROW LEVEL SECURITY;

-- Only the doctor himself can put anything on his board, or change it.
CREATE POLICY "owner manages own board"
  ON public.doctor_board_items FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid() AND public.is_org_owner(org_id));

-- Manager may look, and only when the doctor opened the list himself.
CREATE POLICY "manager reads shared board"
  ON public.doctor_board_items FOR SELECT TO authenticated
  USING (
    visible_to_manager
    AND public.is_org_admin(org_id)
    AND public.board_shared_with_manager(owner_user_id)
  );

CREATE TRIGGER doctor_board_items_updated_at
  BEFORE UPDATE ON public.doctor_board_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Retention purge ----------
CREATE OR REPLACE FUNCTION public.purge_messaging_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed integer := 0;
  n integer;
BEGIN
  WITH s AS (
    SELECT org_id, retention_days FROM public.org_messaging_settings
  ), del AS (
    DELETE FROM public.office_requests r
    USING s
    WHERE r.org_id = s.org_id
      AND r.closed_at IS NOT NULL
      AND r.closed_at < now() - make_interval(days => s.retention_days)
    RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  removed := removed + COALESCE(n, 0);

  WITH s AS (
    SELECT org_id, retention_days FROM public.org_messaging_settings
  ), del AS (
    DELETE FROM public.doctor_board_items b
    USING s
    WHERE b.org_id = s.org_id
      AND b.completed_at IS NOT NULL
      AND b.completed_at < now() - make_interval(days => s.retention_days)
    RETURNING 1
  )
  SELECT count(*) INTO n FROM del;
  RETURN removed + COALESCE(n, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_messaging_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_messaging_retention() TO service_role;

SELECT cron.schedule(
  'purge-messaging-retention',
  '20 4 * * *',
  $$SELECT public.purge_messaging_retention();$$
);
