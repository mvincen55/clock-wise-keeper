-- Office-level practice goal configuration (monthly collections target).
CREATE TABLE public.org_practice_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  monthly_collections_target_cents bigint,
  collections_visibility text NOT NULL DEFAULT 'team',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_practice_settings_visibility_check
    CHECK (collections_visibility IN ('team', 'admins')),
  CONSTRAINT org_practice_settings_target_check
    CHECK (monthly_collections_target_cents IS NULL OR monthly_collections_target_cents >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_practice_settings TO authenticated;
GRANT ALL ON public.org_practice_settings TO service_role;

ALTER TABLE public.org_practice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their office practice settings"
  ON public.org_practice_settings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "Admins manage practice settings"
  ON public.org_practice_settings FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE TRIGGER update_org_practice_settings_updated_at
  BEFORE UPDATE ON public.org_practice_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private sticky notes. Strictly owner-only: never visible to anyone else,
-- including owners and managers of the office.
CREATE TABLE public.user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'plum',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_notes_user_sort_idx ON public.user_notes (user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notes TO authenticated;
GRANT ALL ON public.user_notes TO service_role;

ALTER TABLE public.user_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notes are visible only to their author"
  ON public.user_notes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authors create their own notes"
  ON public.user_notes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE POLICY "Authors update their own notes"
  ON public.user_notes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authors delete their own notes"
  ON public.user_notes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_user_notes_updated_at
  BEFORE UPDATE ON public.user_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();