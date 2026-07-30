-- 1.1 Restore manager-audience protection on checklists (regressed 2026-07-30).
DROP POLICY IF EXISTS checklists_select ON public.checklists;
CREATE POLICY checklists_select ON public.checklists
FOR SELECT TO authenticated
USING (
  is_org_member(org_id) AND (
    owner_user_id = auth.uid()
    OR (
      owner_user_id IS NULL
      AND (audience = 'all' OR is_org_admin(org_id))
    )
  )
);

DROP POLICY IF EXISTS checklist_items_select ON public.checklist_items;
CREATE POLICY checklist_items_select ON public.checklist_items
FOR SELECT TO authenticated
USING (
  is_org_member(org_id) AND (
    owner_user_id = auth.uid()
    OR (
      owner_user_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.checklists c
        WHERE c.id = checklist_items.checklist_id
          AND (c.audience = 'all' OR is_org_admin(c.org_id))
      )
    )
  )
);

-- 1.2 Goals: owner-only writes, and no hard delete at all.
DROP POLICY IF EXISTS "Update own goals" ON public.goals;
CREATE POLICY "Update own goals" ON public.goals
FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND is_org_member(org_id))
WITH CHECK (user_id = auth.uid() AND is_org_member(org_id));

DROP POLICY IF EXISTS "Delete own goals" ON public.goals;
REVOKE DELETE ON public.goals FROM authenticated;

DROP POLICY IF EXISTS "Update own work style profile" ON public.work_style_profiles;
CREATE POLICY "Update own work style profile" ON public.work_style_profiles
FOR UPDATE TO authenticated
USING ((user_id = auth.uid() AND is_org_member(org_id)) OR is_org_admin(org_id))
WITH CHECK ((user_id = auth.uid() AND is_org_member(org_id)) OR is_org_admin(org_id));

-- 1.5 training_assignments: assignees may move status only, never the terms.
CREATE OR REPLACE FUNCTION public.guard_training_assignment_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF public.is_org_admin(NEW.org_id) THEN RETURN NEW; END IF;
  IF NEW.id            IS DISTINCT FROM OLD.id
     OR NEW.org_id     IS DISTINCT FROM OLD.org_id
     OR NEW.module_id  IS DISTINCT FROM OLD.module_id
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by
     OR NEW.due_date   IS DISTINCT FROM OLD.due_date
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the status of your own training assignment can be updated';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_training_assignment_update ON public.training_assignments;
CREATE TRIGGER guard_training_assignment_update
BEFORE UPDATE ON public.training_assignments
FOR EACH ROW EXECUTE FUNCTION public.guard_training_assignment_update();