-- 1. Personal moment preferences become office-specific ------------------
ALTER TABLE public.moment_prefs DROP CONSTRAINT moment_prefs_pkey;
ALTER TABLE public.moment_prefs ADD CONSTRAINT moment_prefs_pkey PRIMARY KEY (org_id, user_id);
CREATE INDEX IF NOT EXISTS moment_prefs_user_idx ON public.moment_prefs (user_id);

-- 2. Honest delivery state on team_moments --------------------------------
ALTER TABLE public.team_moments
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

UPDATE public.team_moments
   SET claimed_at = COALESCE(claimed_at, revealed_at),
       opened_at  = COALESCE(opened_at, revealed_at)
 WHERE revealed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS team_moments_claimable_idx
  ON public.team_moments (recipient_user_id, org_id, created_at)
  WHERE opened_at IS NULL;

-- Guard: delivery timestamps may advance, content never changes.
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

  -- opened_at is write-once: the first confirmed presentation wins.
  IF OLD.opened_at IS NOT NULL THEN
    NEW.opened_at := OLD.opened_at;
  ELSIF NEW.opened_at IS NOT NULL THEN
    NEW.opened_at := now();
  END IF;

  IF OLD.dismissed_at IS NOT NULL THEN
    NEW.dismissed_at := OLD.dismissed_at;
  ELSIF NEW.dismissed_at IS NOT NULL THEN
    NEW.dismissed_at := now();
    NEW.opened_at := COALESCE(NEW.opened_at, now());
  END IF;

  -- revealed_at is retained as a mirror of opened_at for existing history.
  NEW.revealed_at := COALESCE(OLD.revealed_at, NEW.opened_at);

  RETURN NEW;
END;
$$;

-- 3. Atomic claim: one device gets a given moment at a time ---------------
CREATE OR REPLACE FUNCTION public.claim_team_moments(p_org_id uuid, p_limit integer DEFAULT 5)
RETURNS SETOF public.team_moments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5), 1), 12);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Not a member of this office';
  END IF;

  RETURN QUERY
  WITH claimable AS (
    SELECT m.id
      FROM public.team_moments m
     WHERE m.recipient_user_id = v_uid
       AND m.org_id = p_org_id
       AND m.opened_at IS NULL
       AND m.dismissed_at IS NULL
       AND m.expires_at > now()
       AND (m.claimed_at IS NULL OR m.claim_expires_at < now())
     ORDER BY m.created_at
     LIMIT v_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.team_moments t
     SET claimed_at = now(),
         claim_expires_at = now() + interval '2 minutes'
    FROM claimable c
   WHERE t.id = c.id
  RETURNING t.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_team_moments(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_team_moments(uuid, integer) TO authenticated;

-- 4. Confirmed presentation ----------------------------------------------
CREATE OR REPLACE FUNCTION public.open_team_moments(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.team_moments t
     SET opened_at = now()
   WHERE t.id = ANY(COALESCE(p_ids, '{}'::uuid[]))
     AND t.recipient_user_id = v_uid
     AND t.opened_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.open_team_moments(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_team_moments(uuid[]) TO authenticated;

-- 5. Retention: delete old moments per office setting ---------------------
CREATE OR REPLACE FUNCTION public.cleanup_team_moments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.team_moments m
     USING public.orgs o
      LEFT JOIN public.org_moment_settings s ON s.org_id = o.id
     WHERE m.org_id = o.id
       AND m.created_at < now()
            - (GREATEST(COALESCE(s.history_retention_days, 180), 30) || ' days')::interval
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM gone;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_team_moments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_team_moments() TO service_role;