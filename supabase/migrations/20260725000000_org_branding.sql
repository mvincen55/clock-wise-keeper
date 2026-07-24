-- Genericization Phase 1: practice identity becomes org rows.
--
-- org_branding holds everything that identifies the practice on screens,
-- print surfaces, and (future) emails. org_deposit_settings holds the
-- office-specific text printed on the Deposit Log. orgs gains the office
-- Google Calendar id. Existing orgs are backfilled from their
-- fof_settings identity columns, which stay in place (deprecated, no
-- longer read) for one deploy cycle so stale clients keep working.
--
-- NOTE deliberately NOT seeded here: the deposit account line, the org
-- logo, and the Google Calendar id are applied to the live database as
-- data (not repo-tracked migration content) so office-specific
-- values/secrets stop entering the repository.

-- 1) Branding
CREATE TABLE public.org_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- Short name for headings/alt text ("Harelick Dental Associates");
  -- legal_name is the long form printed on forms and footers.
  display_name text NOT NULL DEFAULT '',
  legal_name text NOT NULL DEFAULT '',
  address_line1 text NOT NULL DEFAULT '',
  address_line2 text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  -- Display name used on outbound org email (unused until org email exists).
  email_sender_name text NOT NULL DEFAULT '',
  -- Print accent colors. Defaults are the shipped document palette.
  brand_color text NOT NULL DEFAULT '#53406e'
    CHECK (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  brand_tint text NOT NULL DEFAULT '#f3f0f8'
    CHECK (brand_tint ~ '^#[0-9a-fA-F]{6}$'),
  -- Storage public URL or data: URI. Empty = no logo block printed.
  logo_url text NOT NULL DEFAULT '',
  -- Office Google Calendar consumed by the google-calendar-events
  -- function (org-level setting; applied to the live DB as data, kept on
  -- this admin-managed row because orgs itself is creator-write only).
  google_calendar_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org_branding"
  ON public.org_branding FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage org_branding"
  ON public.org_branding FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_org_branding_updated_at
  BEFORE UPDATE ON public.org_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill from the identity every org already keeps in fof_settings.
INSERT INTO public.org_branding
  (org_id, display_name, legal_name, address_line1, address_line2, phone, website)
SELECT
  fs.org_id,
  trim(regexp_replace(fs.practice_name, '\s*,\s*(LLC|L\.L\.C\.|Inc\.?|P\.?C\.?)\s*$', '', 'i')),
  fs.practice_name,
  fs.address_line1,
  fs.address_line2,
  fs.phone,
  fs.website
FROM public.fof_settings fs
ON CONFLICT (org_id) DO NOTHING;

-- Orgs that never opened the FOF pages still get a (blank) branding row.
INSERT INTO public.org_branding (org_id)
SELECT o.id FROM public.orgs o
WHERE NOT EXISTS (SELECT 1 FROM public.org_branding b WHERE b.org_id = o.id);

-- 2) Deposit Log printed text (office-specific wording; layout stays code)
CREATE TABLE public.org_deposit_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- "Deposit To" line pre-printed on the bank copy. Set as live data,
  -- never in the repo (contains a real account number).
  account_line text NOT NULL DEFAULT '',
  bank_split_cash_label text NOT NULL DEFAULT 'Bank — cash & checks',
  bank_split_cards_label text NOT NULL DEFAULT 'Bank — card deposits',
  bank_total_label text NOT NULL DEFAULT 'Bank Total',
  -- Callout printed on both copies (e.g. envelope handling); empty = omitted.
  envelope_note text NOT NULL DEFAULT '',
  office_copy_note text NOT NULL DEFAULT 'Office Copy — file with the day sheet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.org_deposit_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org_deposit_settings"
  ON public.org_deposit_settings FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

CREATE POLICY "Admins manage org_deposit_settings"
  ON public.org_deposit_settings FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER trg_org_deposit_settings_updated_at
  BEFORE UPDATE ON public.org_deposit_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Existing orgs keep printing exactly what the sheet printed from code.
-- (account_line and envelope_note for the live org are applied as data.)
INSERT INTO public.org_deposit_settings
  (org_id, bank_split_cash_label, bank_split_cards_label, bank_total_label)
SELECT o.id, 'BC Bank — cash & checks', 'F Bank — card deposits', 'BC Bank Total'
FROM public.orgs o
ON CONFLICT (org_id) DO NOTHING;

-- 3) New orgs must not inherit the original office's identity via column
-- defaults; the shipped default for identity is blank.
ALTER TABLE public.fof_settings
  ALTER COLUMN practice_name SET DEFAULT '',
  ALTER COLUMN address_line1 SET DEFAULT '',
  ALTER COLUMN address_line2 SET DEFAULT '',
  ALTER COLUMN phone SET DEFAULT '',
  ALTER COLUMN website SET DEFAULT '',
  ALTER COLUMN doctor_name SET DEFAULT '';

-- 4) Org-scoped logo storage: public read (logos print on documents),
-- admin-managed, foldered by org id like office-docs.
INSERT INTO storage.buckets (id, name, public) VALUES ('org-branding', 'org-branding', true);

CREATE POLICY "Org admins upload branding assets" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'org-branding'
  AND is_org_admin(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org admins update branding assets" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'org-branding'
  AND is_org_admin(((storage.foldername(name))[1])::uuid)
) WITH CHECK (
  bucket_id = 'org-branding'
  AND is_org_admin(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Org admins delete branding assets" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'org-branding'
  AND is_org_admin(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Anyone reads branding assets" ON storage.objects
FOR SELECT USING (bucket_id = 'org-branding');
