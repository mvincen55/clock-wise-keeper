-- PR 1A — Canonical per-org procedure metadata.
--
-- Today a code's patient-friendly name lives in fof_code_names, and there is no
-- home for unit type / teeth / surface / quantity rules. This introduces
-- procedure_meta as the ONE canonical source for procedure semantics per org:
-- patient-friendly + internal description, unit type, needs-teeth, needs-
-- surfaces, quantity strategy, active flag, and search keywords.
--
-- Compatibility: fof_code_names is kept in sync FROM procedure_meta by a trigger
-- so every existing FOF/consent read of the patient-friendly name is unchanged.
-- fof_code_names becomes a derived cache, not an independently editable second
-- place for the patient-facing name. The write path is repointed to
-- procedure_meta (see useProcedureMeta / useUpsertCodeName). A later PR adds the
-- richer metadata editor and retires the fof_code_names cache.
--
-- Additive + idempotent; the backfill is a no-op on an empty replay-from-zero.

CREATE TABLE IF NOT EXISTS public.procedure_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  patient_name text NOT NULL DEFAULT '',
  internal_description text NOT NULL DEFAULT '',
  unit_type text NOT NULL DEFAULT 'per_visit'
    CHECK (unit_type IN ('per_tooth','per_surface','per_quadrant','per_arch','per_visit','flat','manual')),
  needs_teeth boolean NOT NULL DEFAULT false,
  needs_surfaces boolean NOT NULL DEFAULT false,
  quantity_strategy text NOT NULL DEFAULT 'per_visit'
    CHECK (quantity_strategy IN ('per_tooth','per_surface','per_quadrant','per_arch','per_visit','flat','manual')),
  active boolean NOT NULL DEFAULT true,
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS procedure_meta_org_idx ON public.procedure_meta (org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedure_meta TO authenticated;
GRANT ALL ON public.procedure_meta TO service_role;
ALTER TABLE public.procedure_meta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read procedure meta" ON public.procedure_meta;
CREATE POLICY "Members read procedure meta" ON public.procedure_meta FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins manage procedure meta" ON public.procedure_meta;
CREATE POLICY "Admins manage procedure meta" ON public.procedure_meta FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

DROP TRIGGER IF EXISTS procedure_meta_updated_at ON public.procedure_meta;
CREATE TRIGGER procedure_meta_updated_at
  BEFORE UPDATE ON public.procedure_meta
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from the existing patient-friendly names.
INSERT INTO public.procedure_meta (org_id, code, patient_name)
SELECT n.org_id, upper(trim(n.code)), trim(n.patient_name)
FROM public.fof_code_names n
WHERE trim(n.code) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.procedure_meta pm
    WHERE pm.org_id = n.org_id AND pm.code = upper(trim(n.code))
  );

-- Compatibility: mirror the patient-facing name into fof_code_names so existing
-- reads are unchanged. Empty name removes the cache row (i.e. "use the built-in
-- name"), matching the prior clear-to-default behavior.
CREATE OR REPLACE FUNCTION public.sync_fof_code_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := COALESCE(NEW.org_id, OLD.org_id);
  v_code text := upper(trim(COALESCE(NEW.code, OLD.code)));
  v_name text := trim(COALESCE(NEW.patient_name, ''));
BEGIN
  IF TG_OP = 'DELETE' OR v_name = '' THEN
    DELETE FROM public.fof_code_names WHERE org_id = v_org AND upper(code) = v_code;
  ELSE
    INSERT INTO public.fof_code_names (org_id, code, patient_name)
    VALUES (v_org, v_code, v_name)
    ON CONFLICT (org_id, code) DO UPDATE SET patient_name = EXCLUDED.patient_name;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_fof_code_name() FROM anon, authenticated;

DROP TRIGGER IF EXISTS procedure_meta_sync_code_name ON public.procedure_meta;
CREATE TRIGGER procedure_meta_sync_code_name
  AFTER INSERT OR UPDATE OR DELETE ON public.procedure_meta
  FOR EACH ROW EXECUTE FUNCTION public.sync_fof_code_name();
