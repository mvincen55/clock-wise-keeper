-- Fill the Schedule: an activity-based campaign with an individual ledger.
-- Ordinary team sprints (team_goals) are untouched.
-- NO PATIENT DATA: rows hold only employee, campaign, activity type,
-- occurrence timestamp, count, frozen points, verification state/actor/time,
-- internal random ids/codes and linked bonus ids. No free text anywhere.

-- ---------- tables ----------
CREATE TABLE IF NOT EXISTS public.fts_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  timezone text NOT NULL DEFAULT 'America/New_York',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  pts_qr_card int NOT NULL DEFAULT 1 CHECK (pts_qr_card >= 0),
  pts_unscheduled_booking int NOT NULL DEFAULT 1 CHECK (pts_unscheduled_booking >= 0),
  pts_operative_handoff int NOT NULL DEFAULT 2 CHECK (pts_operative_handoff >= 0),
  pts_chairside_card int NULL CHECK (pts_chairside_card IS NULL OR pts_chairside_card >= 0),
  pts_call int NOT NULL DEFAULT 1 CHECK (pts_call >= 0),
  pts_huddle int NOT NULL DEFAULT 1 CHECK (pts_huddle >= 0),
  pts_review_doctor int NOT NULL DEFAULT 3 CHECK (pts_review_doctor >= 0),
  pts_review_hygienist int NOT NULL DEFAULT 3 CHECK (pts_review_hygienist >= 0),
  pts_review_clerical int NOT NULL DEFAULT 5 CHECK (pts_review_clerical >= 0),
  pts_review_assistant int NOT NULL DEFAULT 7 CHECK (pts_review_assistant >= 0),
  pts_attend_bonus int NOT NULL DEFAULT 2 CHECK (pts_attend_bonus >= 0),
  pts_prepay_bonus int NOT NULL DEFAULT 2 CHECK (pts_prepay_bonus >= 0),
  prize_tier1_points int NOT NULL DEFAULT 20 CHECK (prize_tier1_points > 0),
  prize_tier2_points int NOT NULL DEFAULT 30,
  clerical_min_calls int NOT NULL DEFAULT 10 CHECK (clerical_min_calls >= 0),
  open_hours_goal numeric(5,2) NOT NULL DEFAULT 5,
  grand_prize_dollars int NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (prize_tier2_points > prize_tier1_points),
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS public.fts_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  scoring_role text NULL CHECK (scoring_role IN ('doctor','hygienist','clerical','assistant')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.fts_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN
    ('qr_card','unscheduled_booking','operative_handoff','chairside_card','google_review','attend_bonus','prepay_bonus')),
  occurred_at timestamptz NOT NULL,
  tally_week date NOT NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','withdrawn','reversed')),
  awarded_points int NULL,
  parent_id uuid NULL REFERENCES public.fts_activities(id),
  request_key uuid NOT NULL,
  recorded_by uuid NOT NULL,
  verified_by uuid NULL,
  verified_at timestamptz NULL,
  reason_code text NULL CHECK (reason_code IS NULL OR reason_code IN
    ('not_verified_in_record','duplicate_entry','outside_campaign','recorded_in_error','rule_not_met')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, request_key),
  CHECK ((activity_type IN ('attend_bonus','prepay_bonus')) = (parent_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS fts_activities_emp_week_idx ON public.fts_activities (campaign_id, employee_id, tally_week);
CREATE INDEX IF NOT EXISTS fts_activities_pending_idx ON public.fts_activities (campaign_id) WHERE status = 'pending';
-- One live bonus of each kind per originating action.
CREATE UNIQUE INDEX IF NOT EXISTS fts_activities_one_bonus_idx
  ON public.fts_activities (parent_id, activity_type)
  WHERE parent_id IS NOT NULL AND status IN ('pending','approved');

CREATE TABLE IF NOT EXISTS public.fts_weekly_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_key date NOT NULL,
  verified_count int NOT NULL CHECK (verified_count BETWEEN 0 AND 500),
  points_per_call int NOT NULL,
  entered_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, employee_id, week_key)
);

CREATE TABLE IF NOT EXISTS public.fts_huddle_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  huddle_date date NOT NULL,
  week_key date NOT NULL,
  on_time boolean NOT NULL,
  points int NOT NULL,
  entered_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, employee_id, huddle_date)
);

CREATE TABLE IF NOT EXISTS public.fts_week_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  week_key date NOT NULL,
  doctor_open_hours numeric(6,2) NULL CHECK (doctor_open_hours IS NULL OR doctor_open_hours BETWEEN 0 AND 200),
  entered_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, week_key)
);

CREATE TABLE IF NOT EXISTS public.fts_prize_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  week_key date NOT NULL,
  received_count int NOT NULL CHECK (received_count BETWEEN 0 AND 2),
  entered_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, employee_id, week_key)
);

-- Append-only history of every manager or staff change.
CREATE TABLE IF NOT EXISTS public.fts_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  entity text NOT NULL,
  entity_id uuid NULL,
  employee_id uuid NULL,
  action text NOT NULL,
  before jsonb NULL,
  after jsonb NULL,
  actor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fts_audit_entity_idx ON public.fts_audit (entity_id);

-- ---------- grants: read-only for app roles; all writes go through RPCs ----------
REVOKE ALL ON public.fts_campaigns, public.fts_participants, public.fts_activities, public.fts_weekly_calls,
  public.fts_huddle_attendance, public.fts_week_metrics, public.fts_prize_picks, public.fts_audit FROM anon, authenticated;
GRANT SELECT ON public.fts_campaigns, public.fts_participants, public.fts_activities, public.fts_weekly_calls,
  public.fts_huddle_attendance, public.fts_week_metrics, public.fts_prize_picks, public.fts_audit TO authenticated;
GRANT ALL ON public.fts_campaigns, public.fts_participants, public.fts_activities, public.fts_weekly_calls,
  public.fts_huddle_attendance, public.fts_week_metrics, public.fts_prize_picks, public.fts_audit TO service_role;

ALTER TABLE public.fts_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fts_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fts_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fts_weekly_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fts_huddle_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fts_week_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fts_prize_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fts_audit ENABLE ROW LEVEL SECURITY;

-- Is this employee row the signed-in user's own (same org)?
CREATE OR REPLACE FUNCTION public.fts_is_self(_org_id uuid, _employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.employees e
    JOIN public.org_members m ON m.org_id = e.org_id AND m.user_id = e.user_id AND m.status = 'active'
    WHERE e.id = _employee_id AND e.org_id = _org_id AND e.user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.fts_is_self(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fts_is_self(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Members read campaigns" ON public.fts_campaigns;
CREATE POLICY "Members read campaigns" ON public.fts_campaigns FOR SELECT TO authenticated USING (public.is_org_member(org_id));
DROP POLICY IF EXISTS "Members read office week metrics" ON public.fts_week_metrics;
CREATE POLICY "Members read office week metrics" ON public.fts_week_metrics FOR SELECT TO authenticated USING (public.is_org_member(org_id));
DROP POLICY IF EXISTS "Own or admin read participants" ON public.fts_participants;
CREATE POLICY "Own or admin read participants" ON public.fts_participants FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) OR public.fts_is_self(org_id, employee_id));
DROP POLICY IF EXISTS "Own or admin read activities" ON public.fts_activities;
CREATE POLICY "Own or admin read activities" ON public.fts_activities FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) OR public.fts_is_self(org_id, employee_id));
DROP POLICY IF EXISTS "Own or admin read calls" ON public.fts_weekly_calls;
CREATE POLICY "Own or admin read calls" ON public.fts_weekly_calls FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) OR public.fts_is_self(org_id, employee_id));
DROP POLICY IF EXISTS "Own or admin read huddles" ON public.fts_huddle_attendance;
CREATE POLICY "Own or admin read huddles" ON public.fts_huddle_attendance FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) OR public.fts_is_self(org_id, employee_id));
DROP POLICY IF EXISTS "Own or admin read picks" ON public.fts_prize_picks;
CREATE POLICY "Own or admin read picks" ON public.fts_prize_picks FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id) OR public.fts_is_self(org_id, employee_id));
DROP POLICY IF EXISTS "Admins read campaign history" ON public.fts_audit;
CREATE POLICY "Admins read campaign history" ON public.fts_audit FOR SELECT TO authenticated USING (public.is_org_admin(org_id));

DROP TRIGGER IF EXISTS fts_campaigns_updated ON public.fts_campaigns;
CREATE TRIGGER fts_campaigns_updated BEFORE UPDATE ON public.fts_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS fts_activities_updated ON public.fts_activities;
CREATE TRIGGER fts_activities_updated BEFORE UPDATE ON public.fts_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- pure helpers ----------
-- Tally week key: the Friday whose NOON (campaign timezone) closes the tally
-- containing _ts. Friday after noon and Saturday roll forward a week. Keys
-- past the campaign end collapse to the end date (final partial tally).
CREATE OR REPLACE FUNCTION public.fts_week_key(_ts timestamptz, _tz text, _ends date)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE l timestamp := _ts AT TIME ZONE _tz; d date := l::date; dow int := extract(dow FROM l)::int; k date;
BEGIN
  IF dow < 5 OR (dow = 5 AND l::time < time '12:00') THEN k := d + (5 - dow);
  ELSE k := d + (12 - dow); END IF;
  IF _ends IS NOT NULL AND k > _ends THEN k := _ends; END IF;
  RETURN k;
END $$;
GRANT EXECUTE ON FUNCTION public.fts_week_key(timestamptz, text, date) TO authenticated, service_role;

-- Calling actor in the campaign's office: org, employee, admin flag. Raises if not a member.
CREATE OR REPLACE FUNCTION public.fts_actor(_campaign_id uuid, OUT org_id uuid, OUT employee_id uuid, OUT is_admin boolean, OUT camp public.fts_campaigns)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO camp FROM public.fts_campaigns c WHERE c.id = _campaign_id;
  IF camp.id IS NULL THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002'; END IF;
  SELECT m.org_id, (m.role IN ('owner','manager')) INTO org_id, is_admin
    FROM public.org_members m WHERE m.org_id = camp.org_id AND m.user_id = auth.uid() AND m.status = 'active';
  IF org_id IS NULL THEN RAISE EXCEPTION 'Campaign not found' USING ERRCODE = 'P0002'; END IF;
  SELECT e.id INTO employee_id FROM public.employees e WHERE e.org_id = camp.org_id AND e.user_id = auth.uid() LIMIT 1;
END $$;
REVOKE ALL ON FUNCTION public.fts_actor(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fts_require_in_window(_camp public.fts_campaigns, _ts timestamptz)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF _ts IS NULL THEN RAISE EXCEPTION 'When it happened is required' USING ERRCODE = '22023'; END IF;
  IF _ts > now() + interval '2 minutes' THEN RAISE EXCEPTION 'That time is in the future' USING ERRCODE = '22023'; END IF;
  IF _ts < (_camp.starts_on::timestamp AT TIME ZONE _camp.timezone)
     OR _ts >= ((_camp.ends_on + 1)::timestamp AT TIME ZONE _camp.timezone) THEN
    RAISE EXCEPTION 'That time is outside the campaign (% to %)', _camp.starts_on, _camp.ends_on USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fts_require_in_window(public.fts_campaigns, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fts_require_participant(_camp public.fts_campaigns, _employee_id uuid)
RETURNS public.fts_participants LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE p public.fts_participants;
BEGIN
  SELECT * INTO p FROM public.fts_participants WHERE campaign_id = _camp.id AND employee_id = _employee_id AND active;
  IF p.id IS NULL THEN RAISE EXCEPTION 'That team member is not in this campaign' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = _employee_id AND org_id = _camp.org_id AND employment_status = 'active') THEN
    RAISE EXCEPTION 'That team member is not active' USING ERRCODE = '22023'; END IF;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.fts_require_participant(public.fts_campaigns, uuid) FROM PUBLIC, anon, authenticated;

-- Approved points in one tally week for one employee.
CREATE OR REPLACE FUNCTION public.fts_week_points(_campaign_id uuid, _employee_id uuid, _week date)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT sum(awarded_points) FROM public.fts_activities WHERE campaign_id=_campaign_id AND employee_id=_employee_id AND tally_week=_week AND status='approved'),0)::int
       + COALESCE((SELECT verified_count*points_per_call FROM public.fts_weekly_calls WHERE campaign_id=_campaign_id AND employee_id=_employee_id AND week_key=_week),0)
       + COALESCE((SELECT sum(points) FILTER (WHERE on_time) FROM public.fts_huddle_attendance WHERE campaign_id=_campaign_id AND employee_id=_employee_id AND week_key=_week),0)::int;
$$;
REVOKE ALL ON FUNCTION public.fts_week_points(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fts_earned_picks(_campaign_id uuid, _employee_id uuid, _week date)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.fts_campaigns; pts int; role text; calls int;
BEGIN
  SELECT * INTO c FROM public.fts_campaigns WHERE id = _campaign_id;
  pts := public.fts_week_points(_campaign_id, _employee_id, _week);
  SELECT scoring_role INTO role FROM public.fts_participants WHERE campaign_id=_campaign_id AND employee_id=_employee_id;
  SELECT verified_count INTO calls FROM public.fts_weekly_calls WHERE campaign_id=_campaign_id AND employee_id=_employee_id AND week_key=_week;
  IF role = 'clerical' AND COALESCE(calls,0) < c.clerical_min_calls THEN RETURN 0; END IF;
  IF pts >= c.prize_tier2_points THEN RETURN 2; ELSIF pts >= c.prize_tier1_points THEN RETURN 1; END IF;
  RETURN 0;
END $$;
REVOKE ALL ON FUNCTION public.fts_earned_picks(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- Points an activity would freeze at approval right now (NULL = rule not set).
CREATE OR REPLACE FUNCTION public.fts_rate(_camp public.fts_campaigns, _type text, _scoring_role text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _type
    WHEN 'qr_card' THEN _camp.pts_qr_card
    WHEN 'unscheduled_booking' THEN _camp.pts_unscheduled_booking
    WHEN 'operative_handoff' THEN _camp.pts_operative_handoff
    WHEN 'chairside_card' THEN _camp.pts_chairside_card
    WHEN 'attend_bonus' THEN _camp.pts_attend_bonus
    WHEN 'prepay_bonus' THEN _camp.pts_prepay_bonus
    WHEN 'google_review' THEN CASE _scoring_role
      WHEN 'doctor' THEN _camp.pts_review_doctor WHEN 'hygienist' THEN _camp.pts_review_hygienist
      WHEN 'clerical' THEN _camp.pts_review_clerical WHEN 'assistant' THEN _camp.pts_review_assistant END
  END;
$$;
REVOKE ALL ON FUNCTION public.fts_rate(public.fts_campaigns, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fts_log(_camp public.fts_campaigns, _entity text, _entity_id uuid, _employee uuid, _action text, _before jsonb, _after jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fts_audit (org_id, campaign_id, entity, entity_id, employee_id, action, before, after, actor_user_id)
  VALUES (_camp.org_id, _camp.id, _entity, _entity_id, _employee, _action, _before, _after, auth.uid());
$$;
REVOKE ALL ON FUNCTION public.fts_log(public.fts_campaigns, text, uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------- staff RPCs ----------
-- Record one of the caller's own actions. QR cards are honor system and count
-- at once; everything else waits for a manager. Same request key = same row.
CREATE OR REPLACE FUNCTION public.fts_record_own(p_campaign_id uuid, p_type text, p_occurred_at timestamptz, p_quantity int, p_request_key uuid)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r public.fts_activities; pts int;
BEGIN
  a := public.fts_actor(p_campaign_id);
  IF a.employee_id IS NULL THEN RAISE EXCEPTION 'No team member record for your account' USING ERRCODE = '42501'; END IF;
  IF (a.camp).status <> 'active' THEN RAISE EXCEPTION 'This campaign is closed' USING ERRCODE = '22023'; END IF;
  IF p_type NOT IN ('qr_card','unscheduled_booking','operative_handoff','chairside_card') THEN
    RAISE EXCEPTION 'Team members cannot record that action' USING ERRCODE = '42501'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Missing request key' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key;
  IF r.id IS NOT NULL THEN
    IF r.employee_id <> a.employee_id THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '23505'; END IF;
    RETURN r;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR (p_type <> 'qr_card' AND p_quantity <> 1) OR p_quantity > 20 THEN
    RAISE EXCEPTION 'Invalid count' USING ERRCODE = '22023'; END IF;
  PERFORM public.fts_require_participant(a.camp, a.employee_id);
  PERFORM public.fts_require_in_window(a.camp, p_occurred_at);
  pts := CASE WHEN p_type = 'qr_card' THEN (a.camp).pts_qr_card * p_quantity END;
  INSERT INTO public.fts_activities (campaign_id, org_id, employee_id, activity_type, occurred_at, tally_week, quantity,
      status, awarded_points, request_key, recorded_by, verified_at)
    VALUES (p_campaign_id, (a.camp).org_id, a.employee_id, p_type, p_occurred_at,
      public.fts_week_key(p_occurred_at, (a.camp).timezone, (a.camp).ends_on), p_quantity,
      CASE WHEN p_type = 'qr_card' THEN 'approved' ELSE 'pending' END, pts, p_request_key, auth.uid(),
      CASE WHEN p_type = 'qr_card' THEN now() END)
    ON CONFLICT (campaign_id, request_key) DO NOTHING
    RETURNING * INTO r;
  IF r.id IS NULL THEN
    SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key;
    IF r.employee_id <> a.employee_id THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '23505'; END IF;
    RETURN r;
  END IF;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, 'recorded', NULL, to_jsonb(r));
  RETURN r;
END $$;

-- Staff correction: withdraw your own honor-system card entry or your own pending report.
CREATE OR REPLACE FUNCTION public.fts_withdraw_own(p_activity_id uuid, p_reason text)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fts_activities; a record; before jsonb;
BEGIN
  SELECT * INTO r FROM public.fts_activities WHERE id = p_activity_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Entry not found' USING ERRCODE = 'P0002'; END IF;
  a := public.fts_actor(r.campaign_id);
  IF a.employee_id IS DISTINCT FROM r.employee_id THEN RAISE EXCEPTION 'Entry not found' USING ERRCODE = 'P0002'; END IF;
  IF p_reason NOT IN ('recorded_in_error','duplicate_entry') THEN RAISE EXCEPTION 'Choose a reason' USING ERRCODE = '22023'; END IF;
  IF NOT (r.status = 'pending' OR (r.status = 'approved' AND r.activity_type = 'qr_card')) THEN
    RAISE EXCEPTION 'Only pending reports and your own card entries can be withdrawn' USING ERRCODE = '22023'; END IF;
  before := to_jsonb(r);
  UPDATE public.fts_activities SET status = 'withdrawn', reason_code = p_reason WHERE id = r.id RETURNING * INTO r;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, 'withdrawn', before, to_jsonb(r));
  RETURN r;
END $$;

-- ---------- manager RPCs ----------
CREATE OR REPLACE FUNCTION public.fts_require_admin(_campaign_id uuid, _target_employee uuid)
RETURNS record LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  a := public.fts_actor(_campaign_id);
  IF NOT a.is_admin THEN RAISE EXCEPTION 'Only an owner or manager can do this' USING ERRCODE = '42501'; END IF;
  IF _target_employee IS NOT NULL AND a.employee_id = _target_employee THEN
    RAISE EXCEPTION 'Nobody verifies or awards their own record — another manager or the owner must' USING ERRCODE = '42501'; END IF;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.fts_require_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Approve or reject a pending report. Points freeze at approval.
CREATE OR REPLACE FUNCTION public.fts_verify(p_activity_id uuid, p_approve boolean, p_reason text DEFAULT NULL)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fts_activities; a record; pts int; role text; before jsonb;
BEGIN
  SELECT * INTO r FROM public.fts_activities WHERE id = p_activity_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Entry not found' USING ERRCODE = 'P0002'; END IF;
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_actor(r.campaign_id) x;
  IF NOT a.is_admin THEN RAISE EXCEPTION 'Only an owner or manager can do this' USING ERRCODE = '42501'; END IF;
  IF a.employee_id = r.employee_id THEN RAISE EXCEPTION 'Nobody verifies their own record — another manager or the owner must' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This entry was already decided' USING ERRCODE = '22023'; END IF;
  before := to_jsonb(r);
  IF p_approve THEN
    SELECT scoring_role INTO role FROM public.fts_participants WHERE campaign_id = r.campaign_id AND employee_id = r.employee_id;
    pts := public.fts_rate(a.camp, r.activity_type, role);
    IF pts IS NULL THEN RAISE EXCEPTION 'Points not set for this action — set the point rule first' USING ERRCODE = '22023'; END IF;
    UPDATE public.fts_activities SET status='approved', awarded_points = pts * quantity, verified_by = auth.uid(), verified_at = now(), reason_code = NULL
      WHERE id = r.id RETURNING * INTO r;
  ELSE
    IF p_reason IS NULL OR p_reason NOT IN ('not_verified_in_record','duplicate_entry','outside_campaign','recorded_in_error','rule_not_met') THEN
      RAISE EXCEPTION 'Choose a reason' USING ERRCODE = '22023'; END IF;
    UPDATE public.fts_activities SET status='rejected', verified_by = auth.uid(), verified_at = now(), reason_code = p_reason
      WHERE id = r.id RETURNING * INTO r;
  END IF;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, before, to_jsonb(r));
  RETURN r;
END $$;

-- Reverse an approved entry (correction). History keeps the original award.
CREATE OR REPLACE FUNCTION public.fts_reverse(p_activity_id uuid, p_reason text)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.fts_activities; a record; before jsonb;
BEGIN
  SELECT * INTO r FROM public.fts_activities WHERE id = p_activity_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Entry not found' USING ERRCODE = 'P0002'; END IF;
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_actor(r.campaign_id) x;
  IF NOT a.is_admin THEN RAISE EXCEPTION 'Only an owner or manager can do this' USING ERRCODE = '42501'; END IF;
  IF a.employee_id = r.employee_id THEN RAISE EXCEPTION 'Nobody corrects their own record' USING ERRCODE = '42501'; END IF;
  IF r.status <> 'approved' THEN RAISE EXCEPTION 'Only approved entries can be reversed' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('not_verified_in_record','duplicate_entry','outside_campaign','recorded_in_error','rule_not_met') THEN
    RAISE EXCEPTION 'Choose a reason' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.fts_activities WHERE parent_id = r.id AND status IN ('pending','approved')) THEN
    RAISE EXCEPTION 'Reverse the attendance or prepayment bonus linked to this entry first' USING ERRCODE = '22023'; END IF;
  before := to_jsonb(r);
  UPDATE public.fts_activities SET status='reversed', reason_code = p_reason, verified_by = auth.uid(), verified_at = now()
    WHERE id = r.id RETURNING * INTO r;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, 'reversed', before, to_jsonb(r));
  RETURN r;
END $$;

-- Named Google review, verified externally and awarded by a manager.
CREATE OR REPLACE FUNCTION public.fts_award_review(p_campaign_id uuid, p_employee_id uuid, p_occurred_at timestamptz, p_request_key uuid)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; p public.fts_participants; r public.fts_activities; pts int;
BEGIN
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(p_campaign_id, p_employee_id) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key;
  IF r.id IS NOT NULL THEN RETURN r; END IF;
  p := public.fts_require_participant(a.camp, p_employee_id);
  PERFORM public.fts_require_in_window(a.camp, p_occurred_at);
  IF p.scoring_role IS NULL THEN RAISE EXCEPTION 'Set this team member''s scoring role first' USING ERRCODE = '22023'; END IF;
  pts := public.fts_rate(a.camp, 'google_review', p.scoring_role);
  INSERT INTO public.fts_activities (campaign_id, org_id, employee_id, activity_type, occurred_at, tally_week, status, awarded_points,
      request_key, recorded_by, verified_by, verified_at)
    VALUES (p_campaign_id, (a.camp).org_id, p_employee_id, 'google_review', p_occurred_at,
      public.fts_week_key(p_occurred_at, (a.camp).timezone, (a.camp).ends_on), 'approved', pts, p_request_key, auth.uid(), auth.uid(), now())
    ON CONFLICT (campaign_id, request_key) DO NOTHING RETURNING * INTO r;
  IF r.id IS NULL THEN SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key; RETURN r; END IF;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, 'review_awarded', NULL, to_jsonb(r));
  RETURN r;
END $$;

-- Attendance / prepayment bonus linked to an approved originating action. Once per origin.
CREATE OR REPLACE FUNCTION public.fts_award_bonus(p_parent_id uuid, p_type text, p_occurred_at timestamptz, p_request_key uuid)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE par public.fts_activities; a record; r public.fts_activities; pts int;
BEGIN
  SELECT * INTO par FROM public.fts_activities WHERE id = p_parent_id FOR UPDATE;
  IF par.id IS NULL THEN RAISE EXCEPTION 'Original entry not found' USING ERRCODE = 'P0002'; END IF;
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(par.campaign_id, par.employee_id) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  SELECT * INTO r FROM public.fts_activities WHERE campaign_id = par.campaign_id AND request_key = p_request_key;
  IF r.id IS NOT NULL THEN RETURN r; END IF;
  IF par.status <> 'approved' THEN RAISE EXCEPTION 'The original entry must be approved first' USING ERRCODE = '22023'; END IF;
  IF p_type = 'attend_bonus' AND par.activity_type <> 'unscheduled_booking' THEN
    RAISE EXCEPTION 'Attendance bonuses link to a booking from the unscheduled list' USING ERRCODE = '22023'; END IF;
  IF p_type = 'prepay_bonus' AND par.activity_type NOT IN ('unscheduled_booking','operative_handoff') THEN
    RAISE EXCEPTION 'Prepayment bonuses link to an approved booking or handoff' USING ERRCODE = '22023'; END IF;
  IF p_type NOT IN ('attend_bonus','prepay_bonus') THEN RAISE EXCEPTION 'Unknown bonus' USING ERRCODE = '22023'; END IF;
  PERFORM public.fts_require_participant(a.camp, par.employee_id);
  PERFORM public.fts_require_in_window(a.camp, p_occurred_at);
  IF p_occurred_at < par.occurred_at THEN RAISE EXCEPTION 'The bonus cannot happen before the original action' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.fts_activities WHERE parent_id = par.id AND activity_type = p_type AND status IN ('pending','approved')) THEN
    RAISE EXCEPTION 'That bonus was already awarded for this entry' USING ERRCODE = '23505'; END IF;
  pts := public.fts_rate(a.camp, p_type, NULL);
  INSERT INTO public.fts_activities (campaign_id, org_id, employee_id, activity_type, occurred_at, tally_week, status, awarded_points,
      parent_id, request_key, recorded_by, verified_by, verified_at)
    VALUES (par.campaign_id, par.org_id, par.employee_id, p_type, p_occurred_at,
      public.fts_week_key(p_occurred_at, (a.camp).timezone, (a.camp).ends_on), 'approved', pts, par.id, p_request_key, auth.uid(), auth.uid(), now())
    RETURNING * INTO r;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, 'bonus_awarded', NULL, to_jsonb(r));
  RETURN r;
END $$;

-- Verified weekly call count: REPLACES the week's number, never adds.
CREATE OR REPLACE FUNCTION public.fts_set_weekly_calls(p_campaign_id uuid, p_employee_id uuid, p_week_key date, p_count int)
RETURNS public.fts_weekly_calls LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; old public.fts_weekly_calls; r public.fts_weekly_calls; key date;
BEGIN
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(p_campaign_id, p_employee_id) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  PERFORM public.fts_require_participant(a.camp, p_employee_id);
  IF p_count IS NULL OR p_count < 0 OR p_count > 500 THEN RAISE EXCEPTION 'Invalid count' USING ERRCODE = '22023'; END IF;
  key := public.fts_week_key((p_week_key::timestamp + time '11:00') AT TIME ZONE (a.camp).timezone, (a.camp).timezone, (a.camp).ends_on);
  IF key <> p_week_key OR p_week_key < (a.camp).starts_on THEN RAISE EXCEPTION 'Not a tally week of this campaign' USING ERRCODE = '22023'; END IF;
  SELECT * INTO old FROM public.fts_weekly_calls WHERE campaign_id = p_campaign_id AND employee_id = p_employee_id AND week_key = p_week_key FOR UPDATE;
  INSERT INTO public.fts_weekly_calls (campaign_id, org_id, employee_id, week_key, verified_count, points_per_call, entered_by)
    VALUES (p_campaign_id, (a.camp).org_id, p_employee_id, p_week_key, p_count, COALESCE(old.points_per_call, (a.camp).pts_call), auth.uid())
    ON CONFLICT (campaign_id, employee_id, week_key) DO UPDATE SET verified_count = EXCLUDED.verified_count, entered_by = EXCLUDED.entered_by, updated_at = now()
    RETURNING * INTO r;
  PERFORM public.fts_log(a.camp, 'weekly_calls', r.id, p_employee_id, CASE WHEN old.id IS NULL THEN 'set' ELSE 'replaced' END,
    CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END, to_jsonb(r));
  RETURN r;
END $$;

-- Huddle day: manager checks who was present and on time. Saving again updates the same day.
CREATE OR REPLACE FUNCTION public.fts_save_huddle(p_campaign_id uuid, p_date date, p_on_time uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; p record; old public.fts_huddle_attendance; r public.fts_huddle_attendance; n int := 0; wk date;
BEGIN
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(p_campaign_id, NULL) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  IF p_date IS NULL OR p_date < (a.camp).starts_on OR p_date > (a.camp).ends_on OR p_date > (now() AT TIME ZONE (a.camp).timezone)::date THEN
    RAISE EXCEPTION 'Pick a huddle date inside the campaign, not in the future' USING ERRCODE = '22023'; END IF;
  IF a.employee_id = ANY (COALESCE(p_on_time, '{}')) THEN
    RAISE EXCEPTION 'Nobody marks their own huddle attendance — another manager or the owner must' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_on_time,'{}')) u WHERE NOT EXISTS
      (SELECT 1 FROM public.fts_participants pp WHERE pp.campaign_id = p_campaign_id AND pp.employee_id = u AND pp.active)) THEN
    RAISE EXCEPTION 'Someone checked is not in this campaign' USING ERRCODE = '22023'; END IF;
  wk := public.fts_week_key((p_date::timestamp + time '08:00') AT TIME ZONE (a.camp).timezone, (a.camp).timezone, (a.camp).ends_on);
  FOR p IN SELECT pp.employee_id FROM public.fts_participants pp WHERE pp.campaign_id = p_campaign_id AND pp.active
           AND pp.employee_id IS DISTINCT FROM a.employee_id LOOP
    SELECT * INTO old FROM public.fts_huddle_attendance WHERE campaign_id = p_campaign_id AND employee_id = p.employee_id AND huddle_date = p_date FOR UPDATE;
    IF old.id IS NOT NULL AND old.on_time = (p.employee_id = ANY (COALESCE(p_on_time,'{}'))) THEN CONTINUE; END IF;
    IF old.id IS NULL AND NOT (p.employee_id = ANY (COALESCE(p_on_time,'{}'))) THEN CONTINUE; END IF;
    INSERT INTO public.fts_huddle_attendance (campaign_id, org_id, employee_id, huddle_date, week_key, on_time, points, entered_by)
      VALUES (p_campaign_id, (a.camp).org_id, p.employee_id, p_date, wk, p.employee_id = ANY (COALESCE(p_on_time,'{}')),
        COALESCE(old.points, (a.camp).pts_huddle), auth.uid())
      ON CONFLICT (campaign_id, employee_id, huddle_date) DO UPDATE SET on_time = EXCLUDED.on_time, entered_by = EXCLUDED.entered_by, updated_at = now()
      RETURNING * INTO r;
    PERFORM public.fts_log(a.camp, 'huddle', r.id, p.employee_id, CASE WHEN old.id IS NULL THEN 'set' ELSE 'replaced' END,
      CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END, to_jsonb(r));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.fts_set_open_hours(p_campaign_id uuid, p_week_key date, p_hours numeric)
RETURNS public.fts_week_metrics LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; old public.fts_week_metrics; r public.fts_week_metrics; key date;
BEGIN
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(p_campaign_id, NULL) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  key := public.fts_week_key((p_week_key::timestamp + time '11:00') AT TIME ZONE (a.camp).timezone, (a.camp).timezone, (a.camp).ends_on);
  IF key <> p_week_key OR p_week_key < (a.camp).starts_on THEN RAISE EXCEPTION 'Not a tally week of this campaign' USING ERRCODE = '22023'; END IF;
  IF p_hours IS NOT NULL AND (p_hours < 0 OR p_hours > 200) THEN RAISE EXCEPTION 'Invalid hours' USING ERRCODE = '22023'; END IF;
  SELECT * INTO old FROM public.fts_week_metrics WHERE campaign_id = p_campaign_id AND week_key = p_week_key FOR UPDATE;
  INSERT INTO public.fts_week_metrics (campaign_id, org_id, week_key, doctor_open_hours, entered_by)
    VALUES (p_campaign_id, (a.camp).org_id, p_week_key, p_hours, auth.uid())
    ON CONFLICT (campaign_id, week_key) DO UPDATE SET doctor_open_hours = EXCLUDED.doctor_open_hours, entered_by = EXCLUDED.entered_by, updated_at = now()
    RETURNING * INTO r;
  PERFORM public.fts_log(a.camp, 'open_hours', r.id, NULL, 'set', CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END, to_jsonb(r));
  RETURN r;
END $$;

-- Prize picks handed out — never more than currently earned.
CREATE OR REPLACE FUNCTION public.fts_set_picks_received(p_campaign_id uuid, p_employee_id uuid, p_week_key date, p_count int)
RETURNS public.fts_prize_picks LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; old public.fts_prize_picks; r public.fts_prize_picks; earned int;
BEGIN
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(p_campaign_id, p_employee_id) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  PERFORM public.fts_require_participant(a.camp, p_employee_id);
  IF p_count IS NULL OR p_count < 0 OR p_count > 2 THEN RAISE EXCEPTION 'Invalid count' USING ERRCODE = '22023'; END IF;
  SELECT * INTO old FROM public.fts_prize_picks WHERE campaign_id = p_campaign_id AND employee_id = p_employee_id AND week_key = p_week_key FOR UPDATE;
  earned := public.fts_earned_picks(p_campaign_id, p_employee_id, p_week_key);
  IF p_count > earned AND p_count > COALESCE(old.received_count, 0) THEN
    RAISE EXCEPTION 'Only % prize pick(s) earned that week', earned USING ERRCODE = '22023'; END IF;
  INSERT INTO public.fts_prize_picks (campaign_id, org_id, employee_id, week_key, received_count, entered_by)
    VALUES (p_campaign_id, (a.camp).org_id, p_employee_id, p_week_key, p_count, auth.uid())
    ON CONFLICT (campaign_id, employee_id, week_key) DO UPDATE SET received_count = EXCLUDED.received_count, entered_by = EXCLUDED.entered_by, updated_at = now()
    RETURNING * INTO r;
  PERFORM public.fts_log(a.camp, 'prize_picks', r.id, p_employee_id, 'set', CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END, to_jsonb(r));
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fts_set_scoring_role(p_campaign_id uuid, p_employee_id uuid, p_role text, p_active boolean)
RETURNS public.fts_participants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; old public.fts_participants; r public.fts_participants;
BEGIN
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(p_campaign_id, NULL) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  IF p_role IS NOT NULL AND p_role NOT IN ('doctor','hygienist','clerical','assistant') THEN RAISE EXCEPTION 'Unknown scoring role' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id AND org_id = (a.camp).org_id) THEN
    RAISE EXCEPTION 'Team member not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO old FROM public.fts_participants WHERE campaign_id = p_campaign_id AND employee_id = p_employee_id FOR UPDATE;
  INSERT INTO public.fts_participants (campaign_id, org_id, employee_id, scoring_role, active)
    VALUES (p_campaign_id, (a.camp).org_id, p_employee_id, p_role, COALESCE(p_active, true))
    ON CONFLICT (campaign_id, employee_id) DO UPDATE SET scoring_role = EXCLUDED.scoring_role, active = EXCLUDED.active, updated_at = now()
    RETURNING * INTO r;
  PERFORM public.fts_log(a.camp, 'participant', r.id, p_employee_id, 'set', CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END, to_jsonb(r));
  RETURN r;
END $$;

-- Change a point rule. Already-awarded points are frozen and never rewritten.
CREATE OR REPLACE FUNCTION public.fts_set_rate(p_campaign_id uuid, p_key text, p_value int)
RETURNS public.fts_campaigns LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r public.fts_campaigns;
BEGIN
  SELECT x.org_id, x.employee_id, x.is_admin, x.camp INTO a FROM public.fts_require_admin(p_campaign_id, NULL) AS x(org_id uuid, employee_id uuid, is_admin boolean, camp public.fts_campaigns);
  IF p_key NOT IN ('pts_qr_card','pts_unscheduled_booking','pts_operative_handoff','pts_chairside_card','pts_call','pts_huddle',
     'pts_review_doctor','pts_review_hygienist','pts_review_clerical','pts_review_assistant','pts_attend_bonus','pts_prepay_bonus') THEN
    RAISE EXCEPTION 'Unknown rule' USING ERRCODE = '22023'; END IF;
  IF p_value IS NULL AND p_key <> 'pts_chairside_card' THEN RAISE EXCEPTION 'A value is required' USING ERRCODE = '22023'; END IF;
  IF p_value IS NOT NULL AND (p_value < 0 OR p_value > 100) THEN RAISE EXCEPTION 'Points must be 0 to 100' USING ERRCODE = '22023'; END IF;
  EXECUTE format('UPDATE public.fts_campaigns SET %I = $1 WHERE id = $2 RETURNING *', p_key) INTO r USING p_value, p_campaign_id;
  PERFORM public.fts_log(a.camp, 'campaign', r.id, NULL, 'rule_changed', jsonb_build_object(p_key, to_jsonb(a.camp)->p_key), jsonb_build_object(p_key, p_value));
  RETURN r;
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'fts_record_own(uuid,text,timestamptz,int,uuid)','fts_withdraw_own(uuid,text)','fts_verify(uuid,boolean,text)',
    'fts_reverse(uuid,text)','fts_award_review(uuid,uuid,timestamptz,uuid)','fts_award_bonus(uuid,text,timestamptz,uuid)',
    'fts_set_weekly_calls(uuid,uuid,date,int)','fts_save_huddle(uuid,date,uuid[])','fts_set_open_hours(uuid,date,numeric)',
    'fts_set_picks_received(uuid,uuid,date,int)','fts_set_scoring_role(uuid,uuid,text,boolean)','fts_set_rate(uuid,text,int)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ---------- Harelick Dental Associates Q4 2026 (verified org id; no-op elsewhere) ----------
DO $$
DECLARE org uuid := '852fc8e0-4071-499b-b655-f86d6f789cd5'; cid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = org AND name ILIKE 'HARELICK DENTAL%') THEN RETURN; END IF;
  INSERT INTO public.fts_campaigns (org_id, name, starts_on, ends_on)
    VALUES (org, 'Fill the Schedule', '2026-10-01', '2026-12-31')
    ON CONFLICT (org_id, name) DO NOTHING;
  SELECT id INTO cid FROM public.fts_campaigns WHERE org_id = org AND name = 'Fill the Schedule';
  -- Active non-owner team members; scoring role from their primary operational role.
  INSERT INTO public.fts_participants (campaign_id, org_id, employee_id, scoring_role)
  SELECT cid, org, e.id,
    (SELECT CASE r.operational_role::text
        WHEN 'dentist' THEN 'doctor' WHEN 'hygienist' THEN 'hygienist' WHEN 'dental_assistant' THEN 'assistant'
        WHEN 'front_desk' THEN 'clerical' WHEN 'treatment_coordinator' THEN 'clerical'
        WHEN 'office_manager' THEN 'clerical' WHEN 'assistant_office_manager' THEN 'clerical' END
       FROM public.employee_operational_roles r WHERE r.employee_id = e.id
       ORDER BY r.is_primary DESC, r.created_at LIMIT 1)
  FROM public.employees e
  JOIN public.org_members m ON m.org_id = e.org_id AND m.user_id = e.user_id AND m.status = 'active'
  WHERE e.org_id = org AND e.employment_status = 'active' AND m.role <> 'owner'
  ON CONFLICT (campaign_id, employee_id) DO NOTHING;
END $$;
