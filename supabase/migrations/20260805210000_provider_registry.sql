-- PR 1A — Canonical org-scoped provider registry.
--
-- fof_settings.doctor_names was created only for the FOF doctor dropdown and is
-- too narrow for the Forms workflow (which needs hygienists and other
-- clinicians, loginless providers, and inactive providers kept for historical
-- records). This introduces org_providers as the ONE editable source of truth.
--
-- Compatibility: fof_settings.doctor_names is kept in sync FROM the registry by
-- a trigger, so every existing FOF read path keeps working unchanged during the
-- migration. doctor_names is now a derived cache, not an independently editable
-- second source. A later PR migrates FOF (and Forms) to read org_providers
-- directly and retires the array.
--
-- Additive + idempotent; the backfill is a no-op on an empty replay-from-zero.

-- doctor_names was added outside tracked migrations, so guarantee it exists for
-- a clean replay before we reference it below.
ALTER TABLE public.fof_settings
  ADD COLUMN IF NOT EXISTS doctor_names jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.org_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'doctor'
    CHECK (provider_type IN ('doctor', 'hygienist', 'assistant', 'other')),
  -- Optional link to a staff record; providers may exist without a login.
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_providers_org_idx ON public.org_providers (org_id);
-- One live provider per name+type per org (inactive duplicates are allowed as
-- historical records).
CREATE UNIQUE INDEX IF NOT EXISTS org_providers_active_name_idx
  ON public.org_providers (org_id, provider_type, lower(display_name))
  WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_providers TO authenticated;
GRANT ALL ON public.org_providers TO service_role;
ALTER TABLE public.org_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read providers" ON public.org_providers;
CREATE POLICY "Members read providers" ON public.org_providers FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins manage providers" ON public.org_providers;
CREATE POLICY "Admins manage providers" ON public.org_providers FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE TRIGGER org_providers_updated_at
  BEFORE UPDATE ON public.org_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill one provider per distinct fof doctor name, preserving order.
INSERT INTO public.org_providers (org_id, display_name, provider_type, active, sort_order)
SELECT fs.org_id, d.name, 'doctor', true, d.ord
FROM public.fof_settings fs
CROSS JOIN LATERAL (
  SELECT trim(elem.value) AS name, elem.ordinality::int AS ord
  FROM jsonb_array_elements_text(fs.doctor_names) WITH ORDINALITY AS elem(value, ordinality)
  WHERE trim(elem.value) <> ''
) AS d
WHERE NOT EXISTS (
  SELECT 1 FROM public.org_providers p
  WHERE p.org_id = fs.org_id
    AND p.provider_type = 'doctor'
    AND lower(p.display_name) = lower(d.name)
);

-- Compatibility: keep fof_settings.doctor_names in sync from the registry so
-- existing FOF reads are unchanged. doctor_names mirrors active 'doctor'
-- providers, ordered by sort_order then name.
CREATE OR REPLACE FUNCTION public.sync_fof_doctor_names()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := COALESCE(NEW.org_id, OLD.org_id);
  v_names jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(display_name ORDER BY sort_order, display_name), '[]'::jsonb)
  INTO v_names
  FROM public.org_providers
  WHERE org_id = v_org AND active AND provider_type = 'doctor';

  UPDATE public.fof_settings
  SET doctor_names = v_names
  WHERE org_id = v_org;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_fof_doctor_names() FROM anon, authenticated;

CREATE TRIGGER org_providers_sync_doctor_names
  AFTER INSERT OR UPDATE OR DELETE ON public.org_providers
  FOR EACH ROW EXECUTE FUNCTION public.sync_fof_doctor_names();
