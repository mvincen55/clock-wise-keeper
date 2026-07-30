CREATE TABLE public.office_nudges (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NULL,
  surface text NOT NULL CHECK (surface IN ('dashboard','clock','checklists','goals','training','huddle','deposit')),
  kind text NOT NULL,
  content text NOT NULL,
  data_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','shown','acted_on','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

GRANT SELECT, UPDATE ON public.office_nudges TO authenticated;
GRANT ALL ON public.office_nudges TO service_role;

ALTER TABLE public.office_nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own and office-wide nudges"
  ON public.office_nudges FOR SELECT TO authenticated
  USING (
    public.is_org_member(org_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Admins read all nudges in their org"
  ON public.office_nudges FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "Members update their own and office-wide nudges"
  ON public.office_nudges FOR UPDATE TO authenticated
  USING (
    public.is_org_member(org_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  )
  WITH CHECK (
    public.is_org_member(org_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Admins update all nudges in their org"
  ON public.office_nudges FOR UPDATE TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE INDEX office_nudges_lookup_idx
  ON public.office_nudges (org_id, surface, kind, created_at DESC);

CREATE INDEX office_nudges_user_idx
  ON public.office_nudges (org_id, user_id, status, created_at DESC);