-- In-app editing for library documents (Office Handbook / Insurance Desk).
-- The OWNER can always edit document text; whether MANAGERS may edit too is
-- the owner's call, stored here. All staff can read the flag (the reader
-- uses it to decide whether to show the Edit action); only owners write it.

CREATE TABLE public.doc_library_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  managers_can_edit boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_library_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read doc_library_settings"
  ON public.doc_library_settings FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Owners manage doc_library_settings"
  ON public.doc_library_settings FOR ALL
  TO authenticated
  USING (is_org_owner(org_id))
  WITH CHECK (is_org_owner(org_id));

CREATE TRIGGER update_doc_library_settings_updated_at
  BEFORE UPDATE ON public.doc_library_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
