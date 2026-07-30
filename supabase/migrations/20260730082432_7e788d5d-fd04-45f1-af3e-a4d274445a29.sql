CREATE TABLE public.training_audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  category text NOT NULL DEFAULT 'other',
  quote text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  suggested_fix text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_audit_findings_severity_chk CHECK (severity IN ('critical','warning','info')),
  CONSTRAINT training_audit_findings_status_chk CHECK (status IN ('open','dismissed','fixed')),
  CONSTRAINT training_audit_findings_unique UNIQUE (module_id, fingerprint)
);

CREATE INDEX training_audit_findings_module_idx ON public.training_audit_findings (module_id, status);
CREATE INDEX training_audit_findings_org_idx ON public.training_audit_findings (org_id, status);

GRANT SELECT, UPDATE ON public.training_audit_findings TO authenticated;
GRANT ALL ON public.training_audit_findings TO service_role;

ALTER TABLE public.training_audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and managers read training audit findings"
ON public.training_audit_findings FOR SELECT TO authenticated
USING (public.is_org_admin(org_id));

CREATE POLICY "Owners and managers resolve training audit findings"
ON public.training_audit_findings FOR UPDATE TO authenticated
USING (public.is_org_admin(org_id))
WITH CHECK (public.is_org_admin(org_id));

CREATE TRIGGER update_training_audit_findings_updated_at
BEFORE UPDATE ON public.training_audit_findings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();