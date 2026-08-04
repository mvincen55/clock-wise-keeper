-- Authenticated writes remain RPC-only, but owners and managers must be able
-- to read the unpublished items they are drafting and reviewing. The general
-- member policy still exposes only the current published version to its target
-- audience.

CREATE POLICY "Admins read all knowledge items"
  ON public.knowledge_items FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));

COMMENT ON POLICY "Admins read all knowledge items"
  ON public.knowledge_items IS
  'Lets owners and managers see drafts and review items without restoring direct table writes.';
