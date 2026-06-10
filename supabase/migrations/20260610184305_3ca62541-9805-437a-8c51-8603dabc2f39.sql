
CREATE TABLE IF NOT EXISTS public.schedule_correction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  version_id uuid NOT NULL,
  employee_id uuid,
  edited_by uuid NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  old_values jsonb NOT NULL,
  new_values jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_correction_log_version
  ON public.schedule_correction_log(version_id);
CREATE INDEX IF NOT EXISTS idx_schedule_correction_log_org
  ON public.schedule_correction_log(org_id);

GRANT SELECT, INSERT ON public.schedule_correction_log TO authenticated;
GRANT ALL ON public.schedule_correction_log TO service_role;

ALTER TABLE public.schedule_correction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can read schedule corrections"
ON public.schedule_correction_log
FOR SELECT
TO authenticated
USING (
  org_id IS NULL
    AND edited_by = auth.uid()
  OR public.is_org_admin(org_id)
);

CREATE POLICY "Authenticated users can insert their own corrections"
ON public.schedule_correction_log
FOR INSERT
TO authenticated
WITH CHECK (edited_by = auth.uid());
