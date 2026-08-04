-- Replay repair: org_practice_settings reached production through a platform
-- edit that never became a migration file, so a clean-database replay had no
-- creator for it — this ALTER was the chain's first reference. Create the
-- table (matching the production definition, including the roleplay/security
-- columns that also arrived outside the chain) before altering it. Harmless
-- on the live ledger — this migration never re-runs where already applied,
-- and every statement is guarded.
CREATE TABLE IF NOT EXISTS public.org_practice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  monthly_collections_target_cents bigint,
  collections_visibility text NOT NULL DEFAULT 'everyone',
  roleplay_persona_style text NOT NULL DEFAULT 'balanced',
  roleplay_policy_tone text NOT NULL DEFAULT 'warm_professional',
  roleplay_notes text,
  security_alert_managers boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_practice_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.org_practice_settings'::regclass
      AND polname = 'Members can read their office practice settings'
  ) THEN
    CREATE POLICY "Members can read their office practice settings"
      ON public.org_practice_settings FOR SELECT
      TO authenticated
      USING (is_org_member(org_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.org_practice_settings'::regclass
      AND polname = 'Admins manage practice settings'
  ) THEN
    CREATE POLICY "Admins manage practice settings"
      ON public.org_practice_settings FOR ALL
      TO authenticated
      USING (is_org_admin(org_id))
      WITH CHECK (is_org_admin(org_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.org_practice_settings'::regclass
      AND tgname = 'trg_org_practice_settings_updated_at'
  ) THEN
    CREATE TRIGGER trg_org_practice_settings_updated_at
      BEFORE UPDATE ON public.org_practice_settings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS owners_clock_in boolean NOT NULL DEFAULT false;
