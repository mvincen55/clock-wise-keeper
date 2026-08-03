CREATE TABLE public.checklist_bypasses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  checklist_date text NOT NULL,
  bypassed_at timestamptz NOT NULL DEFAULT now(),
  incomplete_count integer NOT NULL DEFAULT 0,
  reason text,
  reason_submitted_at timestamptz,
  escalation_level integer NOT NULL DEFAULT 1,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_bypasses_user_date_key UNIQUE (user_id, checklist_date)
);

GRANT SELECT, INSERT, UPDATE ON public.checklist_bypasses TO authenticated;
GRANT ALL ON public.checklist_bypasses TO service_role;

ALTER TABLE public.checklist_bypasses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own bypasses"
ON public.checklist_bypasses FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Org admins read all bypasses"
ON public.checklist_bypasses FOR SELECT TO authenticated
USING (public.is_org_admin(org_id));

CREATE POLICY "Members answer their own unresolved bypasses"
ON public.checklist_bypasses FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND resolved = false)
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_checklist_bypass_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
     OR NEW.checklist_date IS DISTINCT FROM OLD.checklist_date
     OR NEW.bypassed_at IS DISTINCT FROM OLD.bypassed_at
     OR NEW.incomplete_count IS DISTINCT FROM OLD.incomplete_count
     OR NEW.escalation_level IS DISTINCT FROM OLD.escalation_level THEN
    RAISE EXCEPTION 'Only the reason and resolution of a checklist bypass can be updated';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_checklist_bypass_update
BEFORE UPDATE ON public.checklist_bypasses
FOR EACH ROW EXECUTE FUNCTION public.guard_checklist_bypass_update();

CREATE INDEX idx_checklist_bypasses_org_date ON public.checklist_bypasses (org_id, checklist_date DESC);
CREATE INDEX idx_checklist_bypasses_user_unresolved ON public.checklist_bypasses (user_id) WHERE resolved = false;