-- Office-wide PTO policy with per-person exceptions.
--
-- Until now the accrual inputs (weekly worked-hours cap, maximum balance,
-- negative balances) lived only per person in pto_settings, and the policy
-- card wrote the signed-in admin's own row. The office now has one default;
-- a person is an exception only when their values differ from it.
--
-- Nobody's accrual changes when this runs:
--  - the default is seeded with the values every ledger already assumed
--    (40 / 100 / no negative), which is also what a person with no row got;
--  - existing rows keep their values; a row equal to the default is marked
--    "not an exception", any other row becomes an explicit exception;
--  - people with no row get one on the office default only when they have
--    an employment date (the ledger's tenure read is unchanged either way).
-- The live ledger keeps reading pto_settings, so the numbers it produces
-- today are the numbers it produces tomorrow.

CREATE TABLE public.org_pto_policy (
 org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
 worked_hours_cap_weekly numeric NOT NULL DEFAULT 40 CHECK (worked_hours_cap_weekly >= 0),
 max_balance numeric NOT NULL DEFAULT 100 CHECK (max_balance >= 0),
 allow_negative boolean NOT NULL DEFAULT false,
 updated_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.org_pto_policy IS 'The office''s PTO accrual defaults; pto_settings rows without policy_override follow them.';
CREATE TRIGGER org_pto_policy_updated_at
 BEFORE UPDATE ON public.org_pto_policy
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.org_pto_policy (org_id) SELECT id FROM public.orgs ON CONFLICT (org_id) DO NOTHING;

ALTER TABLE public.pto_settings
 ADD COLUMN IF NOT EXISTS policy_override boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.pto_settings.policy_override IS 'True when this person''s cap, maximum, or negative-balance setting deliberately differs from the office policy.';

-- Backfill: equal to the default → follows the office; anything else → an explicit exception.
UPDATE public.pto_settings s
   SET policy_override = (s.worked_hours_cap_weekly <> p.worked_hours_cap_weekly
                          OR s.max_balance <> p.max_balance
                          OR s.allow_negative <> p.allow_negative)
  FROM public.org_pto_policy p
 WHERE p.org_id = s.org_id;

-- People with no row start on the office default (never an exception). A
-- login already holding a row elsewhere is left alone (pto_settings.user_id
-- is unique), as is anyone with no employment date on file.
INSERT INTO public.pto_settings (org_id, employee_id, user_id, hire_date, worked_hours_cap_weekly, max_balance, allow_negative, timezone, policy_override)
SELECT e.org_id, e.id, e.user_id, coalesce(e.real_hire_date, e.hire_date), p.worked_hours_cap_weekly, p.max_balance, p.allow_negative,
       coalesce(e.timezone, 'America/New_York'), false
  FROM public.employees e
  JOIN public.org_pto_policy p ON p.org_id = e.org_id
 WHERE coalesce(e.real_hire_date, e.hire_date) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.pto_settings s WHERE s.employee_id = e.id)
   AND (e.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.pto_settings s2 WHERE s2.user_id = e.user_id));

ALTER TABLE public.org_pto_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_pto_policy_read ON public.org_pto_policy FOR SELECT TO authenticated
 USING (public.is_org_member(org_id));
REVOKE ALL ON public.org_pto_policy FROM anon, authenticated;
GRANT SELECT ON public.org_pto_policy TO authenticated;
GRANT ALL ON public.org_pto_policy TO service_role;

-- Owners set the office policy. The new default reaches everyone without an
-- exception in the same transaction; exceptions keep their values.
CREATE OR REPLACE FUNCTION public.set_org_pto_policy(p_org_id uuid, p_cap numeric, p_max numeric, p_allow_negative boolean)
RETURNS public.org_pto_policy
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_policy public.org_pto_policy;
  v_before public.org_pto_policy;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_org_owner(p_org_id) THEN RAISE EXCEPTION 'Only an owner sets the office PTO policy' USING ERRCODE = '42501'; END IF;
  IF p_cap IS NULL OR p_max IS NULL OR p_cap < 0 OR p_max < 0 THEN RAISE EXCEPTION 'Enter nonnegative PTO limits' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_before FROM public.org_pto_policy WHERE org_id = p_org_id FOR UPDATE;
  INSERT INTO public.org_pto_policy (org_id, worked_hours_cap_weekly, max_balance, allow_negative, updated_by)
  VALUES (p_org_id, p_cap, p_max, coalesce(p_allow_negative, false), v_uid)
  ON CONFLICT (org_id) DO UPDATE
    SET worked_hours_cap_weekly = EXCLUDED.worked_hours_cap_weekly, max_balance = EXCLUDED.max_balance,
        allow_negative = EXCLUDED.allow_negative, updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_policy;
  UPDATE public.pto_settings
     SET worked_hours_cap_weekly = v_policy.worked_hours_cap_weekly, max_balance = v_policy.max_balance, allow_negative = v_policy.allow_negative
   WHERE org_id = p_org_id AND policy_override = false;
  INSERT INTO public.audit_events (user_id, org_id, actor_id, event_type, action_type, target_table, target_id, before_json, after_json, event_details)
  VALUES (v_uid, p_org_id, v_uid, 'pto_policy_updated', 'update', 'org_pto_policy', p_org_id,
          CASE WHEN v_before.org_id IS NULL THEN NULL ELSE jsonb_build_object('worked_hours_cap_weekly', v_before.worked_hours_cap_weekly, 'max_balance', v_before.max_balance, 'allow_negative', v_before.allow_negative) END,
          jsonb_build_object('worked_hours_cap_weekly', v_policy.worked_hours_cap_weekly, 'max_balance', v_policy.max_balance, 'allow_negative', v_policy.allow_negative),
          jsonb_build_object('target_employee_id', NULL));
  RETURN v_policy;
END $$;
REVOKE ALL ON FUNCTION public.set_org_pto_policy(uuid, numeric, numeric, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.set_org_pto_policy(uuid, numeric, numeric, boolean) TO authenticated;

-- New people start on the office default, and a row follows the login when
-- one is linked later (the employee-facing policy on pto_settings is keyed
-- on user_id, so a row created before the login existed was invisible to
-- its own person).
CREATE OR REPLACE FUNCTION public.pto_settings_follow_employee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.real_hire_date, NEW.hire_date) IS NOT NULL
       AND (NEW.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.pto_settings s WHERE s.user_id = NEW.user_id)) THEN
      INSERT INTO public.pto_settings (org_id, employee_id, user_id, hire_date, worked_hours_cap_weekly, max_balance, allow_negative, timezone, policy_override)
      SELECT NEW.org_id, NEW.id, NEW.user_id, coalesce(NEW.real_hire_date, NEW.hire_date), p.worked_hours_cap_weekly, p.max_balance, p.allow_negative,
             coalesce(NEW.timezone, 'America/New_York'), false
        FROM public.org_pto_policy p WHERE p.org_id = NEW.org_id
      ON CONFLICT (employee_id) DO NOTHING;
    END IF;
  ELSIF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    UPDATE public.pto_settings
       SET user_id = NEW.user_id
     WHERE employee_id = NEW.id AND user_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.pto_settings s WHERE s.user_id = NEW.user_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pto_settings_follow_employee
 AFTER INSERT OR UPDATE OF user_id ON public.employees
 FOR EACH ROW EXECUTE FUNCTION public.pto_settings_follow_employee();

-- A new office gets its policy row with the defaults.
CREATE OR REPLACE FUNCTION public.org_pto_policy_for_new_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.org_pto_policy (org_id) VALUES (NEW.id) ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER org_pto_policy_for_new_org
 AFTER INSERT ON public.orgs
 FOR EACH ROW EXECUTE FUNCTION public.org_pto_policy_for_new_org();
