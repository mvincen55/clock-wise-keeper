-- Four housekeeping fixes from the 2026-09-15 system review.
--
-- 1. Objects that existed only in the live database. office_nudges and the
--    three messaging RPCs (ensure_dm, ensure_ai_conversation,
--    mark_conversation_read) were created outside the repository, so a
--    fresh replay lacked them. They are recorded here exactly as they run
--    live; every statement is idempotent so the live database is unchanged.
-- 2. Days off go through the request flow. Employees could insert their own
--    days_off rows directly, with any type and hours, bypassing PTO
--    approval. Owners and managers keep the direct path; everyone else
--    submits a PTO request (the app now does this for them).
-- 3. Payroll settings are the office's, not a manager's. Rows were keyed by
--    the admin who saved them, so an office with two managers could hold two
--    disagreeing rows. One row per office; every member of the office can
--    read it (pay period and week start are needed to render timesheets).

-- ---------------------------------------------------------------------------
-- 1a. office_nudges
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.office_nudges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid,
  surface text NOT NULL CHECK (surface IN ('dashboard','clock','checklists','goals','training','huddle','deposit')),
  kind text NOT NULL,
  content text NOT NULL,
  data_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','shown','acted_on','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS office_nudges_lookup_idx ON public.office_nudges (org_id, surface, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS office_nudges_user_idx ON public.office_nudges (org_id, user_id, status, created_at DESC);

ALTER TABLE public.office_nudges ENABLE ROW LEVEL SECURITY;

-- Members see office-wide nudges and their own; admins see and update all.
-- Rows are written by office-pulse with the service role; no client INSERT.
DROP POLICY IF EXISTS "Members read their own and office-wide nudges" ON public.office_nudges;
CREATE POLICY "Members read their own and office-wide nudges" ON public.office_nudges
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id) AND (user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS "Members update their own and office-wide nudges" ON public.office_nudges;
CREATE POLICY "Members update their own and office-wide nudges" ON public.office_nudges
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id) AND (user_id IS NULL OR user_id = auth.uid()))
  WITH CHECK (public.is_org_member(org_id) AND (user_id IS NULL OR user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins read all nudges in their org" ON public.office_nudges;
CREATE POLICY "Admins read all nudges in their org" ON public.office_nudges
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));

DROP POLICY IF EXISTS "Admins update all nudges in their org" ON public.office_nudges;
CREATE POLICY "Admins update all nudges in their org" ON public.office_nudges
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- 1b. Messaging RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_ai_conversation()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.ensure_dm(_other_user uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conv uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_org uuid;
BEGIN
  IF NOT public.can_read_conv(_conv) THEN RAISE EXCEPTION 'Not your conversation'; END IF;
  SELECT org_id INTO v_org FROM public.conversations WHERE id = _conv;
  INSERT INTO public.conversation_participants (org_id, conversation_id, user_id, last_read_at)
  VALUES (v_org, _conv, auth.uid(), now())
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_ai_conversation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_dm(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_ai_conversation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_dm(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Days off: employees request, managers record.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Employees insert own days_off" ON public.days_off;

-- ---------------------------------------------------------------------------
-- 3. Payroll settings: one row per office, readable by the office.
-- ---------------------------------------------------------------------------

-- Keep each office's most recently saved row.
DELETE FROM public.payroll_settings older
 USING public.payroll_settings newer
 WHERE older.org_id = newer.org_id
   AND older.id <> newer.id
   AND (newer.updated_at > older.updated_at
        OR (newer.updated_at = older.updated_at AND newer.id > older.id));

ALTER TABLE public.payroll_settings DROP CONSTRAINT IF EXISTS payroll_settings_user_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_settings_org_id_key' AND conrelid = 'public.payroll_settings'::regclass
  ) THEN
    ALTER TABLE public.payroll_settings ADD CONSTRAINT payroll_settings_org_id_key UNIQUE (org_id);
  END IF;
END $$;

DROP POLICY IF EXISTS "Own payroll_settings select" ON public.payroll_settings;
DROP POLICY IF EXISTS "Members read office payroll_settings" ON public.payroll_settings;
CREATE POLICY "Members read office payroll_settings" ON public.payroll_settings
  FOR SELECT TO authenticated USING (public.is_org_member(org_id));
