-- Frozen FOF — complete schema (single file, replaces the product's
-- migration chain). Matches the pre-refactor application code exactly:
-- only the tables, functions, triggers, and RLS the FOF core uses.
-- Apply once in the Supabase SQL editor of a fresh project.

-- ── Enums ─────────────────────────────────────────────────────────
CREATE TYPE public.app_org_role AS ENUM ('owner', 'manager', 'employee');
CREATE TYPE public.org_member_status AS ENUM ('active', 'invited', 'disabled');
CREATE TYPE public.employment_status AS ENUM ('active', 'inactive', 'terminated');

-- ── Helper functions ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

-- ── Core tables ───────────────────────────────────────────────────
CREATE TABLE public.orgs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.org_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_org_role NOT NULL DEFAULT 'employee',
  status public.org_member_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE public.org_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_org_role NOT NULL DEFAULT 'employee',
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + '7 days'::interval),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.allowed_users (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid,
  display_name text NOT NULL,
  email text,
  employment_status public.employment_status NOT NULL DEFAULT 'active',
  hire_date date,
  timezone text NOT NULL DEFAULT 'America/New_York',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- Membership helpers (SECURITY DEFINER so RLS can use them without
-- recursing).
CREATE OR REPLACE FUNCTION public.is_allowed_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.allowed_users
    WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org_id AND user_id = auth.uid()
      AND status = 'active' AND role IN ('owner', 'manager')
  );
$$;

-- ── FOF tables ────────────────────────────────────────────────────
CREATE TABLE public.fee_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'carrier' CHECK (kind IN ('office', 'carrier', 'payment')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_in_network boolean NOT NULL DEFAULT false,
  UNIQUE (id, org_id)
);

CREATE TABLE public.fee_schedule_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL DEFAULT '',
  fee_cents integer NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('preventive', 'basic', 'major', 'workup', 'other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL DEFAULT '',
  UNIQUE (schedule_id, code),
  FOREIGN KEY (schedule_id, org_id) REFERENCES public.fee_schedules(id, org_id) ON DELETE CASCADE
);

CREATE TABLE public.insurance_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  fee_schedule_id uuid,
  preventive_pct integer NOT NULL DEFAULT 100 CHECK (preventive_pct BETWEEN 0 AND 100),
  basic_pct integer NOT NULL DEFAULT 80 CHECK (basic_pct BETWEEN 0 AND 100),
  major_pct integer NOT NULL DEFAULT 50 CHECK (major_pct BETWEEN 0 AND 100),
  deductible_cents integer NOT NULL DEFAULT 5000,
  deductible_waived_preventive boolean NOT NULL DEFAULT true,
  annual_max_cents integer NOT NULL DEFAULT 150000,
  writeoff_applies boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_in_network boolean NOT NULL DEFAULT true,
  office_fees_after_max boolean NOT NULL DEFAULT false,
  FOREIGN KEY (fee_schedule_id, org_id) REFERENCES public.fee_schedules(id, org_id) ON DELETE SET NULL (fee_schedule_id)
);

-- Practice header for the printed form (pre-refactor shape: identity
-- lives here, defaults are the practice's own values).
CREATE TABLE public.fof_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  practice_name text NOT NULL DEFAULT 'Harelick Dental Associates, LLC',
  address_line1 text NOT NULL DEFAULT '278 Alden Road',
  address_line2 text NOT NULL DEFAULT 'Fairhaven, MA 02719',
  phone text NOT NULL DEFAULT '(508) 993-0515',
  website text NOT NULL DEFAULT 'drharelick.com',
  doctor_name text NOT NULL DEFAULT 'Dr. Scott',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fof_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  discount_percent numeric(5,2) NOT NULL DEFAULT 10.00,
  discount_label text NOT NULL DEFAULT 'Office Discount (Prepay discount)',
  show_insurance_estimate boolean NOT NULL DEFAULT false,
  show_write_off boolean NOT NULL DEFAULT false,
  show_prepay_option boolean NOT NULL DEFAULT true,
  show_installment_option boolean NOT NULL DEFAULT true,
  installment_count integer NOT NULL DEFAULT 3 CHECK (installment_count BETWEEN 1 AND 6),
  installment_labels jsonb NOT NULL DEFAULT
    '["Visit 1 (Upon scheduling)","Visit 2 (Prep date)","Visit 3 (On delivery)"]'::jsonb,
  footnotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  signature_intro text NOT NULL DEFAULT
    'has read this Financial Options Form in its entirety and agrees to the following plan:',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  footnote_validity text NOT NULL DEFAULT '',
  footnote_prepay text NOT NULL DEFAULT '',
  footnote_insurance text NOT NULL DEFAULT '',
  footnote_contact text NOT NULL DEFAULT '',
  membership_discount_percent integer NOT NULL DEFAULT 0
    CHECK (membership_discount_percent BETWEEN 0 AND 100),
  senior_discount_applies boolean NOT NULL DEFAULT false
);

CREATE TABLE public.fof_procedure_bundles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX idx_fee_schedules_org ON public.fee_schedules(org_id, sort_order);
CREATE INDEX idx_fee_schedule_items_schedule ON public.fee_schedule_items(schedule_id, code);
CREATE INDEX idx_insurance_plans_org ON public.insurance_plans(org_id, sort_order);
CREATE INDEX idx_fof_templates_org ON public.fof_templates(org_id, sort_order);

-- ── Triggers ──────────────────────────────────────────────────────
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER update_orgs_updated_at BEFORE UPDATE ON public.orgs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_org_members_updated_at BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fee_schedules_updated_at BEFORE UPDATE ON public.fee_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fee_schedule_items_updated_at BEFORE UPDATE ON public.fee_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_insurance_plans_updated_at BEFORE UPDATE ON public.insurance_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fof_settings_updated_at BEFORE UPDATE ON public.fof_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fof_templates_updated_at BEFORE UPDATE ON public.fof_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fof_bundles_updated_at BEFORE UPDATE ON public.fof_procedure_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Row Level Security ────────────────────────────────────────────
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fof_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fof_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fof_procedure_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org creator manages org" ON public.orgs FOR ALL
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Org members can read org" ON public.orgs FOR SELECT
  TO authenticated USING (is_org_member(id));

CREATE POLICY "Members see own memberships" ON public.org_members FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Members see org admin memberships" ON public.org_members FOR SELECT
  USING (is_org_member(org_id) AND role IN ('owner', 'manager') AND status = 'active');
CREATE POLICY "Org creator manages members" ON public.org_members FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = org_members.org_id AND orgs.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = org_members.org_id AND orgs.created_by = auth.uid()));

CREATE POLICY "Org creator manages invites" ON public.org_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = org_invites.org_id AND orgs.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = org_invites.org_id AND orgs.created_by = auth.uid()));

CREATE POLICY "Allowed users can read allowlist" ON public.allowed_users FOR SELECT
  USING (auth.uid() IS NOT NULL AND (SELECT email FROM auth.users WHERE id = auth.uid()) IN (SELECT email FROM public.allowed_users));

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT
  USING (auth.uid() = id AND is_allowed_user());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND is_allowed_user());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND is_allowed_user());

CREATE POLICY "Employee sees self" ON public.employees FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Org creator manages employees" ON public.employees FOR ALL
  USING (EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = employees.org_id AND orgs.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orgs WHERE orgs.id = employees.org_id AND orgs.created_by = auth.uid()));

CREATE POLICY "Members read fee_schedules" ON public.fee_schedules FOR SELECT
  TO authenticated USING (is_org_member(org_id));
CREATE POLICY "Admins manage fee_schedules" ON public.fee_schedules FOR ALL
  TO authenticated USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read fee_schedule_items" ON public.fee_schedule_items FOR SELECT
  TO authenticated USING (is_org_member(org_id));
CREATE POLICY "Admins manage fee_schedule_items" ON public.fee_schedule_items FOR ALL
  TO authenticated USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read insurance_plans" ON public.insurance_plans FOR SELECT
  TO authenticated USING (is_org_member(org_id));
CREATE POLICY "Admins manage insurance_plans" ON public.insurance_plans FOR ALL
  TO authenticated USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read fof_settings" ON public.fof_settings FOR SELECT
  TO authenticated USING (is_org_member(org_id));
CREATE POLICY "Admins manage fof_settings" ON public.fof_settings FOR ALL
  TO authenticated USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read fof_templates" ON public.fof_templates FOR SELECT
  TO authenticated USING (is_org_member(org_id));
CREATE POLICY "Admins manage fof_templates" ON public.fof_templates FOR ALL
  TO authenticated USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));

CREATE POLICY "Members read fof_procedure_bundles" ON public.fof_procedure_bundles FOR SELECT
  TO authenticated USING (is_org_member(org_id));
CREATE POLICY "Admins manage fof_procedure_bundles" ON public.fof_procedure_bundles FOR ALL
  TO authenticated USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
