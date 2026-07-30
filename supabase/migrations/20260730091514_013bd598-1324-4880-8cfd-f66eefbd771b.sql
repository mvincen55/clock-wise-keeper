CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  actor_user_id uuid,
  kind text NOT NULL CHECK (kind IN ('auth_abuse','function_abuse','ai_jailbreak','time_anomaly','deposit_discrepancy','destructive_action')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'watch' CHECK (severity IN ('watch','elevated')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed')),
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz
);

GRANT SELECT, UPDATE ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- Owners and managers review integrity events, but never their own: an actor
-- must not learn that a detector fired on them.
CREATE POLICY "Admins read integrity events that are not about them"
ON public.security_events FOR SELECT TO authenticated
USING (public.is_org_admin(org_id) AND (actor_user_id IS NULL OR actor_user_id <> auth.uid()));

CREATE POLICY "Admins review integrity events that are not about them"
ON public.security_events FOR UPDATE TO authenticated
USING (public.is_org_admin(org_id) AND (actor_user_id IS NULL OR actor_user_id <> auth.uid()))
WITH CHECK (public.is_org_admin(org_id) AND (actor_user_id IS NULL OR actor_user_id <> auth.uid()));

-- A repeated pattern is only reported once while it is still open or dismissed.
CREATE UNIQUE INDEX security_events_live_fingerprint_idx
  ON public.security_events (org_id, fingerprint)
  WHERE status <> 'reviewed';

CREATE INDEX security_events_org_created_idx
  ON public.security_events (org_id, created_at DESC);

ALTER TABLE public.org_practice_settings
  ADD COLUMN IF NOT EXISTS security_alert_managers boolean NOT NULL DEFAULT false;