
-- ============ CHECKLISTS ============
CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','manager')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklists_org_idx ON public.checklists(org_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY checklists_select ON public.checklists FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY checklists_admin_write ON public.checklists FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- ============ CHECKLIST ITEMS ============
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  title text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily','weekly','monthly','yearly')),
  per_person boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checklist_items_list_idx ON public.checklist_items(checklist_id, sort_order);
CREATE INDEX checklist_items_org_idx ON public.checklist_items(org_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_items TO authenticated;
GRANT ALL ON public.checklist_items TO service_role;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY checklist_items_select ON public.checklist_items FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY checklist_items_admin_write ON public.checklist_items FOR ALL TO authenticated USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- ============ CHECKLIST COMPLETIONS ============
CREATE TABLE public.checklist_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  completed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_by_name text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX checklist_completions_unique
  ON public.checklist_completions(item_id, period_key, completed_by);
CREATE INDEX checklist_completions_period_idx ON public.checklist_completions(org_id, period_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_completions TO authenticated;
GRANT ALL ON public.checklist_completions TO service_role;
ALTER TABLE public.checklist_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY completions_select ON public.checklist_completions FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY completions_insert_self ON public.checklist_completions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND completed_by = auth.uid());
CREATE POLICY completions_delete_self ON public.checklist_completions FOR DELETE TO authenticated
  USING (public.is_org_member(org_id) AND (completed_by = auth.uid() OR public.is_org_admin(org_id)));

-- ============ DEPOSIT LOGS ============
CREATE TABLE public.deposit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  deposit_date date NOT NULL,
  cash_cents integer NOT NULL DEFAULT 0,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ins_cc_cents integer NOT NULL DEFAULT 0,
  pt_cc_cents integer NOT NULL DEFAULT 0,
  illumitrac_cents integer NOT NULL DEFAULT 0,
  outside_financing_cents integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  prepared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, deposit_date)
);
CREATE INDEX deposit_logs_org_date_idx ON public.deposit_logs(org_id, deposit_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_logs TO authenticated;
GRANT ALL ON public.deposit_logs TO service_role;
ALTER TABLE public.deposit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY deposit_logs_select ON public.deposit_logs FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY deposit_logs_admin_write ON public.deposit_logs FOR ALL TO authenticated
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- ============ IMPORTANT NUMBERS ============
CREATE TABLE public.important_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'Other',
  label text NOT NULL,
  value text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX important_numbers_org_idx ON public.important_numbers(org_id, section, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.important_numbers TO authenticated;
GRANT ALL ON public.important_numbers TO service_role;
ALTER TABLE public.important_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY important_numbers_select ON public.important_numbers FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY important_numbers_admin_write ON public.important_numbers FOR ALL TO authenticated
  USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));

-- ============ updated_at triggers ============
CREATE TRIGGER trg_checklists_updated BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_checklist_items_updated BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_deposit_logs_updated BEFORE UPDATE ON public.deposit_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_important_numbers_updated BEFORE UPDATE ON public.important_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
