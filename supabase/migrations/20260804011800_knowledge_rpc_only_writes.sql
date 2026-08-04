-- The governed workflow must be database-enforced, not merely a UI convention.
-- Authenticated clients receive read access only. All authoring, review, and
-- publication writes go through the security-definer functions that verify
-- organization membership, state transitions, and author/reviewer separation.

REVOKE INSERT, UPDATE, DELETE ON public.knowledge_categories FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_blocks FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_evidence FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_reviews FROM authenticated;

DROP POLICY IF EXISTS "Admins manage knowledge categories" ON public.knowledge_categories;
DROP POLICY IF EXISTS "Admins manage knowledge items" ON public.knowledge_items;
DROP POLICY IF EXISTS "Admins manage knowledge versions" ON public.knowledge_versions;
DROP POLICY IF EXISTS "Admins manage knowledge blocks" ON public.knowledge_blocks;
DROP POLICY IF EXISTS "Admins manage knowledge evidence" ON public.knowledge_evidence;

CREATE POLICY "Admins read knowledge evidence"
  ON public.knowledge_evidence FOR SELECT
  TO authenticated
  USING (public.is_org_admin(org_id));

-- Defense in depth: even a future grant cannot insert a forged approved or
-- published row. Legitimate creation starts as a caller-authored draft. A
-- controlled migration or future import can opt in transaction-locally through
-- app.knowledge_workflow after performing its own validation.
CREATE OR REPLACE FUNCTION public.guard_knowledge_version_workflow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(current_setting('app.knowledge_workflow', true), '') <> '1' THEN
      IF NEW.status <> 'draft'
         OR NEW.created_by IS DISTINCT FROM auth.uid()
         OR NEW.submitted_by IS NOT NULL
         OR NEW.submitted_at IS NOT NULL
         OR NEW.approved_by IS NOT NULL
         OR NEW.approved_at IS NOT NULL
         OR NEW.published_by IS NOT NULL
         OR NEW.published_at IS NOT NULL THEN
        RAISE EXCEPTION 'New knowledge versions must begin as caller-authored drafts';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF (
    NEW.status IS DISTINCT FROM OLD.status
    OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.published_by IS DISTINCT FROM OLD.published_by
    OR NEW.published_at IS DISTINCT FROM OLD.published_at
  ) AND COALESCE(current_setting('app.knowledge_workflow', true), '') <> '1' THEN
    RAISE EXCEPTION 'Knowledge workflow fields may only be changed through workflow actions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_knowledge_version_workflow
  ON public.knowledge_versions;
CREATE TRIGGER guard_knowledge_version_workflow
  BEFORE INSERT OR UPDATE ON public.knowledge_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_version_workflow();

COMMENT ON TABLE public.knowledge_versions IS
  'Governed versions. Authenticated clients read through RLS and write only through guarded RPCs.';
