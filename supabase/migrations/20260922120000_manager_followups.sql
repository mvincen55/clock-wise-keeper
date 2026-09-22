-- Manager follow-ups: what a manager has done ABOUT an attention item.
--
-- Attention items are derived from records (punches, requests, closeouts,
-- versions, accountability records); nothing here creates one. This table
-- holds the two layers that sit beside a record without changing it:
--
--   work state    — needs_action | waiting_on_employee | waiting_on_reviewer
--                   | followed_up: who the item is waiting on, since when,
--                   and by when;
--   presentation  — parked_until (a date) and snoozed_until (a time): the
--                   item stays open and due, it only leaves the "now" list.
--
-- Asking, parking, snoozing, or noting never corrects a source record, and a
-- row here never resolves an item: an item leaves Attention only when its
-- record changes. Rows are keyed by the item key ("kind:record id") so a
-- follow-up survives refresh and devices, and simply stops matching once the
-- record is resolved.

CREATE TABLE public.manager_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
 item_key text NOT NULL CHECK (item_key ~ '^[a-z_]+:[^[:space:]]{1,160}$'),
 work_state text NOT NULL DEFAULT 'needs_action'
  CHECK (work_state IN ('needs_action','waiting_on_employee','waiting_on_reviewer','followed_up')),
 -- Who the item waits on (an employee or another reviewer), when it was
 -- asked, and the day an answer is due.
 owner_user_id uuid,
 requested_at timestamptz,
 due_at date,
 -- Presentation only. A park is a date ("back Monday"); a snooze is a time.
 parked_until date,
 snoozed_until timestamptz,
 note text CHECK (note IS NULL OR length(note) <= 2000),
 created_by uuid NOT NULL,
 updated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (org_id, item_key),
 -- Waiting on someone is always dated.
 CHECK (work_state NOT IN ('waiting_on_employee','waiting_on_reviewer') OR requested_at IS NOT NULL)
);
COMMENT ON TABLE public.manager_followups IS 'Work state and presentation state a manager attaches to an attention item, keyed by item key; never changes the underlying record.';

-- The signed-in manager is the author of every write; the client cannot
-- claim otherwise. (BEFORE ROW triggers run before the row-level policies
-- check the row, so the policies below verify what this stamps.)
CREATE OR REPLACE FUNCTION public.manager_followup_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
 ELSE
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.org_id := OLD.org_id;
  NEW.item_key := OLD.item_key;
 END IF;
 NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
 NEW.updated_at := now();
 IF NEW.work_state NOT IN ('waiting_on_employee','waiting_on_reviewer') THEN
  NEW.owner_user_id := NULL;
  NEW.requested_at := NULL;
  NEW.due_at := NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manager_followup_guard
 BEFORE INSERT OR UPDATE ON public.manager_followups
 FOR EACH ROW EXECUTE FUNCTION public.manager_followup_guard();

ALTER TABLE public.manager_followups ENABLE ROW LEVEL SECURITY;
-- Owners and managers of the office only. Members never see follow-ups;
-- what they are asked reaches them as a notification or a message.
CREATE POLICY manager_followups_select ON public.manager_followups FOR SELECT TO authenticated
 USING (public.is_org_admin(org_id));
CREATE POLICY manager_followups_insert ON public.manager_followups FOR INSERT TO authenticated
 WITH CHECK (public.is_org_admin(org_id) AND created_by = auth.uid() AND updated_by = auth.uid());
CREATE POLICY manager_followups_update ON public.manager_followups FOR UPDATE TO authenticated
 USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id) AND updated_by = auth.uid());
CREATE POLICY manager_followups_delete ON public.manager_followups FOR DELETE TO authenticated
 USING (public.is_org_admin(org_id));
REVOKE ALL ON public.manager_followups FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_followups TO authenticated;
GRANT ALL ON public.manager_followups TO service_role;
CREATE INDEX manager_followups_org_state ON public.manager_followups (org_id, work_state);

-- Payroll readiness works to a deadline only when the office has set one:
-- the number of days after a pay period ends that payroll is submitted.
-- Null means no deadline is shown anywhere, never a guessed one. A bi-weekly
-- office also names a known period start so periods pair from it instead of
-- from an assumed week.
ALTER TABLE public.payroll_settings
 ADD COLUMN IF NOT EXISTS payroll_due_days_after_period integer
  CHECK (payroll_due_days_after_period IS NULL OR payroll_due_days_after_period BETWEEN 0 AND 14),
 ADD COLUMN IF NOT EXISTS pay_period_anchor date;
COMMENT ON COLUMN public.payroll_settings.payroll_due_days_after_period IS 'Days after a pay period ends that payroll is due; null = no deadline is derived.';
COMMENT ON COLUMN public.payroll_settings.pay_period_anchor IS 'A known first day of a pay period; bi-weekly periods are counted from it.';
