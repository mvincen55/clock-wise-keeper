-- =====================================================================
-- TEAM MOMENTS — lightweight positive recognition
-- Deliberately separate from `notifications`: a celebration must never sit
-- in the same queue as an approval, safety item, or required acknowledgment.
-- =====================================================================

-- Office-level switch and anti-spam envelope.
CREATE TABLE public.org_moment_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  /* Anti-spam. Enforced by trigger, not just the UI. */
  max_per_sender_per_hour smallint NOT NULL DEFAULT 10 CHECK (max_per_sender_per_hour BETWEEN 1 AND 60),
  max_per_pair_per_day smallint NOT NULL DEFAULT 3 CHECK (max_per_pair_per_day BETWEEN 1 AND 20),
  /* An unseen moment stops waiting after this many days. */
  unseen_expiry_days smallint NOT NULL DEFAULT 30 CHECK (unseen_expiry_days BETWEEN 1 AND 180),
  /* Read history retention, for the office's own housekeeping. */
  history_retention_days smallint NOT NULL DEFAULT 180 CHECK (history_retention_days BETWEEN 7 AND 730),
  /* Optional message text can be switched off entirely. */
  allow_message boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.org_moment_settings TO authenticated;
GRANT INSERT, UPDATE ON public.org_moment_settings TO authenticated;
GRANT ALL ON public.org_moment_settings TO service_role;
ALTER TABLE public.org_moment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their office moment settings"
  ON public.org_moment_settings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins create their office moment settings"
  ON public.org_moment_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "Admins update their office moment settings"
  ON public.org_moment_settings FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));


-- Personal preference: mute the motion, or opt out of receiving entirely.
CREATE TABLE public.moment_prefs (
  user_id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  /* Still delivered, just no opening animation. */
  animations_muted boolean NOT NULL DEFAULT false,
  /* Opt out of receiving moments at all. */
  receive_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.moment_prefs TO authenticated;
GRANT ALL ON public.moment_prefs TO service_role;
ALTER TABLE public.moment_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "People manage only their own moment preferences"
  ON public.moment_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));


-- The moment itself.
CREATE TABLE public.team_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

  sender_user_id uuid NOT NULL,
  sender_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL,
  recipient_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  /* Positive recognition only — the allowed set is closed here, in the
     database, so no corrective or sarcastic reaction can ever be stored. */
  reaction text NOT NULL CHECK (reaction IN (
    'nice_work', 'celebrate', 'thank_you', 'crushed_it', 'great_save', 'team_win'
  )),
  message text CHECK (message IS NULL OR char_length(btrim(message)) BETWEEN 1 AND 240),
  /* Optional operational context, e.g. "Covering Assisting". Presentation
     only — it never grants or implies permission. */
  context_label text CHECK (context_label IS NULL OR char_length(btrim(context_label)) BETWEEN 1 AND 60),

  created_at timestamptz NOT NULL DEFAULT now(),
  /* Set exactly once, by the recipient. Idempotent across devices. */
  revealed_at timestamptz,
  dismissed_at timestamptz,
  /* An unseen moment stops waiting after this. */
  expires_at timestamptz NOT NULL,

  CONSTRAINT team_moments_not_self CHECK (sender_employee_id <> recipient_employee_id),
  CONSTRAINT team_moments_not_self_user CHECK (sender_user_id <> recipient_user_id)
);

CREATE INDEX team_moments_recipient_pending_idx
  ON public.team_moments (recipient_user_id, created_at DESC)
  WHERE revealed_at IS NULL;
CREATE INDEX team_moments_recipient_idx ON public.team_moments (recipient_user_id, created_at DESC);
CREATE INDEX team_moments_sender_idx ON public.team_moments (sender_user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.team_moments TO authenticated;
GRANT ALL ON public.team_moments TO service_role;
ALTER TABLE public.team_moments ENABLE ROW LEVEL SECURITY;

-- Read: recipient and sender only. No management browse, no office-wide read.
CREATE POLICY "Recipient and sender read their own moments"
  ON public.team_moments FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid() OR sender_user_id = auth.uid());

-- Send: you, from your own active employee record, to another active member of
-- the SAME office. Cross-office is impossible: both sides are checked against
-- the row's org_id.
CREATE POLICY "Active members send moments inside their own office"
  ON public.team_moments FOR INSERT TO authenticated
  WITH CHECK (
    sender_user_id = auth.uid()
    AND public.is_org_member(org_id)
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = sender_employee_id
        AND e.org_id = team_moments.org_id
        AND e.user_id = auth.uid()
        AND e.employment_status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = recipient_employee_id
        AND e.org_id = team_moments.org_id
        AND e.user_id = recipient_user_id
        AND e.employment_status = 'active'
    )
  );

-- Reveal/dismiss: recipient only. The guard trigger below restricts which
-- columns may actually change.
CREATE POLICY "Recipient marks their own moment revealed or dismissed"
  ON public.team_moments FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());


-- ---------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------

-- Stamp expiry from office settings, honour the office switch, the recipient's
-- opt-out, the message toggle, and the anti-spam limits.
CREATE OR REPLACE FUNCTION public.team_moments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.org_moment_settings%ROWTYPE;
  sent_last_hour int;
  sent_to_pair_today int;
  recipient_opted_out boolean;
BEGIN
  SELECT * INTO s FROM public.org_moment_settings WHERE org_id = NEW.org_id;
  IF NOT FOUND THEN
    -- Office has never configured it: defaults apply, feature on.
    s.enabled := true;
    s.max_per_sender_per_hour := 10;
    s.max_per_pair_per_day := 3;
    s.unseen_expiry_days := 30;
    s.allow_message := true;
  END IF;

  IF NOT s.enabled THEN
    RAISE EXCEPTION 'Team Moments are turned off for this office';
  END IF;

  IF NOT s.allow_message AND NEW.message IS NOT NULL THEN
    RAISE EXCEPTION 'This office has messages turned off for Team Moments';
  END IF;

  SELECT NOT receive_enabled INTO recipient_opted_out
    FROM public.moment_prefs WHERE user_id = NEW.recipient_user_id;
  IF COALESCE(recipient_opted_out, false) THEN
    RAISE EXCEPTION 'This person has turned off Team Moments';
  END IF;

  SELECT count(*) INTO sent_last_hour
    FROM public.team_moments
   WHERE sender_user_id = NEW.sender_user_id
     AND created_at > now() - interval '1 hour';
  IF sent_last_hour >= s.max_per_sender_per_hour THEN
    RAISE EXCEPTION 'Sending limit reached. Try again a little later.';
  END IF;

  SELECT count(*) INTO sent_to_pair_today
    FROM public.team_moments
   WHERE sender_user_id = NEW.sender_user_id
     AND recipient_employee_id = NEW.recipient_employee_id
     AND created_at > now() - interval '24 hours';
  IF sent_to_pair_today >= s.max_per_pair_per_day THEN
    RAISE EXCEPTION 'You have already sent this person several moments today.';
  END IF;

  -- Server owns these; the client cannot pre-set them.
  NEW.created_at := now();
  NEW.revealed_at := NULL;
  NEW.dismissed_at := NULL;
  NEW.expires_at := now() + make_interval(days => s.unseen_expiry_days);
  NEW.message := nullif(btrim(NEW.message), '');
  NEW.context_label := nullif(btrim(NEW.context_label), '');
  RETURN NEW;
END;
$$;

CREATE TRIGGER team_moments_before_insert
  BEFORE INSERT ON public.team_moments
  FOR EACH ROW EXECUTE FUNCTION public.team_moments_before_insert();

-- A moment's wording is fixed once sent. The recipient may only move it
-- forward: unrevealed -> revealed -> dismissed. Reveal is write-once, so a
-- retry from a second device is a harmless no-op rather than a re-reveal.
CREATE OR REPLACE FUNCTION public.team_moments_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.sender_user_id IS DISTINCT FROM OLD.sender_user_id
     OR NEW.sender_employee_id IS DISTINCT FROM OLD.sender_employee_id
     OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
     OR NEW.recipient_employee_id IS DISTINCT FROM OLD.recipient_employee_id
     OR NEW.reaction IS DISTINCT FROM OLD.reaction
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.context_label IS DISTINCT FROM OLD.context_label
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'A team moment cannot be edited after it is sent';
  END IF;

  -- Write-once reveal: keep the first timestamp.
  IF OLD.revealed_at IS NOT NULL THEN
    NEW.revealed_at := OLD.revealed_at;
  ELSIF NEW.revealed_at IS NOT NULL THEN
    NEW.revealed_at := now();
  END IF;

  IF OLD.dismissed_at IS NOT NULL THEN
    NEW.dismissed_at := OLD.dismissed_at;
  ELSIF NEW.dismissed_at IS NOT NULL THEN
    NEW.dismissed_at := now();
    -- Dismissing implies it was seen.
    NEW.revealed_at := COALESCE(NEW.revealed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER team_moments_guard_update
  BEFORE UPDATE ON public.team_moments
  FOR EACH ROW EXECUTE FUNCTION public.team_moments_guard_update();