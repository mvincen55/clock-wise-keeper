-- Letterhead & Office Correspondence — DE-IDENTIFIED CONFIGURATION ONLY.
--
-- HIPAA boundary (same contract as 20260803210000_broken_appointments.sql):
-- deliberately NO patient tables and NO completed-letter storage. A letter's
-- recipient values, school/work-note fields, and every other patient-typed
-- value live only in browser memory and go straight to the printer; they are
-- never persisted or transmitted. What IS stored:
--
--   letter_templates          reusable office wording ({{placeholder}} tokens
--                             stand in for patient values; the client scans
--                             storable content for patient identifiers and
--                             blocks the save — this table must never receive
--                             a filled personalized letter)
--   correspondence_settings   per-office rules (default closing, office
--                             signer, note wording, team template permission)
--   staff_signatures          each staff member's OWN stored signature — an
--                             office/business asset, completely separate from
--                             patient consent signatures (which stay
--                             memory-only in Complete Forms)
--
-- Additive + idempotent. Follows the consent_forms permission pattern:
-- team-tier writes are gated by an office setting THROUGH RLS
-- (correspondence_team_can), not just UI.

-- ================================================================
-- 1. letter_templates — the reusable office letter library
-- ================================================================

CREATE TABLE IF NOT EXISTS public.letter_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN (
    'general','insurance','employer','referral','records','financial',
    'patient','office_notice','other'
  )),
  -- Optional RE: line wording; {{placeholder}} tokens allowed.
  subject text NOT NULL DEFAULT '',
  -- Letter-markup body; {{placeholder}} tokens stand in for patient values.
  body text NOT NULL,
  -- Blank = the office's default closing at use time.
  closing text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_letter_templates_org
  ON public.letter_templates(org_id, status, category);

-- ================================================================
-- 2. correspondence_settings — one row of office rules per org
-- ================================================================

CREATE TABLE IF NOT EXISTS public.correspondence_settings (
  org_id uuid PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- Default closing phrase for every letter surface.
  default_closing text NOT NULL DEFAULT 'Warm regards,',
  -- Office-level signer (kept separate and explicit from personal
  -- signatures; blank name falls back to the practice name at render time).
  default_signer_name text NOT NULL DEFAULT '',
  default_signer_title text NOT NULL DEFAULT '',
  -- School/Work note base wording; blank = the built-in defaults in
  -- src/lib/letters/note-wording.ts. {{placeholder}} tokens only.
  school_note_wording text NOT NULL DEFAULT '',
  work_note_wording text NOT NULL DEFAULT '',
  -- OFF = only owners/managers may create/edit/archive saved letters.
  -- Enforced through RLS via correspondence_team_can(), not just UI.
  team_can_manage_templates boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- 3. staff_signatures — each member's own stored signature (metadata)
-- ================================================================

-- The image itself lives in the private 'staff-signatures' bucket at
-- {org_id}/{user_id}/signature.png; this row records that it exists and
-- whether the owner allows teammates to print it on office letters/notes.
-- A signature binds to the AUTHENTICATED USER: only they may create,
-- replace, or remove it — managers can see THAT one exists, never write it.
CREATE TABLE IF NOT EXISTS public.staff_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  -- Self-service authorization: teammates may select this person as the
  -- signer of an office-generated letter/note and print their stored ink.
  -- false = the signature renders only for its owner.
  allow_office_use boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id),
  -- The row may only ever point at its own org/user folder — RLS forbids
  -- cross-tenant paths even if a client tried to write one.
  CONSTRAINT staff_signature_path_matches CHECK (
    storage_path = org_id::text || '/' || user_id::text || '/signature.png'
  )
);

CREATE INDEX IF NOT EXISTS idx_staff_signatures_org
  ON public.staff_signatures(org_id, user_id);

-- ================================================================
-- 4. Grants, triggers
-- ================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.letter_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.correspondence_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_signatures TO authenticated;
GRANT ALL ON public.letter_templates TO service_role;
GRANT ALL ON public.correspondence_settings TO service_role;
GRANT ALL ON public.staff_signatures TO service_role;

DROP TRIGGER IF EXISTS trg_letter_templates_updated_at ON public.letter_templates;
CREATE TRIGGER trg_letter_templates_updated_at
  BEFORE UPDATE ON public.letter_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_correspondence_settings_updated_at ON public.correspondence_settings;
CREATE TRIGGER trg_correspondence_settings_updated_at
  BEFORE UPDATE ON public.correspondence_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_staff_signatures_updated_at ON public.staff_signatures;
CREATE TRIGGER trg_staff_signatures_updated_at
  BEFORE UPDATE ON public.staff_signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================
-- 5. Permission helper + RLS
-- ================================================================

-- Reads the office's team-permission flag without granting table access
-- (consent_team_can pattern). SECURITY DEFINER so policies can consult it;
-- returns false when the org has never saved settings (safe default:
-- managers only).
CREATE OR REPLACE FUNCTION public.correspondence_team_can(p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT s.team_can_manage_templates
    FROM public.correspondence_settings s
    WHERE s.org_id = p_org_id
  ), false);
$$;

REVOKE EXECUTE ON FUNCTION public.correspondence_team_can(uuid) FROM anon;

ALTER TABLE public.letter_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correspondence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_signatures ENABLE ROW LEVEL SECURITY;

-- Templates: every member reads (using approved letters is everyone's job);
-- creating/editing/archiving is admins, plus the team when the office
-- setting grants it. Deleting is admins only.
DROP POLICY IF EXISTS "Members read letter templates" ON public.letter_templates;
CREATE POLICY "Members read letter templates"
  ON public.letter_templates FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins and permitted team create letter templates" ON public.letter_templates;
CREATE POLICY "Admins and permitted team create letter templates"
  ON public.letter_templates FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.correspondence_team_can(org_id))
  );

DROP POLICY IF EXISTS "Admins and permitted team update letter templates" ON public.letter_templates;
CREATE POLICY "Admins and permitted team update letter templates"
  ON public.letter_templates FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.correspondence_team_can(org_id))
  )
  WITH CHECK (
    public.is_org_admin(org_id)
    OR (public.is_org_member(org_id) AND public.correspondence_team_can(org_id))
  );

DROP POLICY IF EXISTS "Admins delete letter templates" ON public.letter_templates;
CREATE POLICY "Admins delete letter templates"
  ON public.letter_templates FOR DELETE TO authenticated
  USING (public.is_org_admin(org_id));

-- Office rules: members read (every letter surface applies them), admins write.
DROP POLICY IF EXISTS "Members read correspondence settings" ON public.correspondence_settings;
CREATE POLICY "Members read correspondence settings"
  ON public.correspondence_settings FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Admins manage correspondence settings" ON public.correspondence_settings;
CREATE POLICY "Admins manage correspondence settings"
  ON public.correspondence_settings FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- Signature metadata: members see who has configured one (row metadata,
-- never the image — the storage policies below gate the pixels). All writes
-- bind to the authenticated user: nobody, including owners/managers, can
-- create or change someone else's signature row.
DROP POLICY IF EXISTS "Members read staff signature metadata" ON public.staff_signatures;
CREATE POLICY "Members read staff signature metadata"
  ON public.staff_signatures FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Users create own staff signature" ON public.staff_signatures;
CREATE POLICY "Users create own staff signature"
  ON public.staff_signatures FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS "Users update own staff signature" ON public.staff_signatures;
CREATE POLICY "Users update own staff signature"
  ON public.staff_signatures FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

DROP POLICY IF EXISTS "Users delete own staff signature" ON public.staff_signatures;
CREATE POLICY "Users delete own staff signature"
  ON public.staff_signatures FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_org_member(org_id));

-- ================================================================
-- 6. Private storage bucket for staff signature images
-- ================================================================

-- Private on purpose: no public URLs to anyone's handwriting. Reads go
-- through authenticated download/signed URLs under the policies below.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('staff-signatures', 'staff-signatures', false, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

-- Path contract: {org_id}/{user_id}/signature.png — writes only to your own
-- folder inside an org you belong to.
DROP POLICY IF EXISTS "Users upload own staff signature" ON storage.objects;
CREATE POLICY "Users upload own staff signature"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-signatures'
    AND owner = auth.uid()
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Users replace own staff signature" ON storage.objects;
CREATE POLICY "Users replace own staff signature"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "Users delete own staff signature" ON storage.objects;
CREATE POLICY "Users delete own staff signature"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Reading the image: always your own; a teammate's ONLY when (a) you share
-- the org and (b) the owner's allow_office_use flag says teammates may print
-- it. A stored signature can never become silent impersonation — the DB
-- enforces the owner's consent, not the UI.
DROP POLICY IF EXISTS "Users read own staff signature" ON storage.objects;
CREATE POLICY "Users read own staff signature"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-signatures'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Members read authorized staff signatures" ON storage.objects;
CREATE POLICY "Members read authorized staff signatures"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-signatures'
    AND public.is_org_member(((storage.foldername(name))[1])::uuid)
    AND EXISTS (
      SELECT 1 FROM public.staff_signatures s
      WHERE s.org_id = ((storage.foldername(name))[1])::uuid
        AND s.user_id = ((storage.foldername(name))[2])::uuid
        AND s.allow_office_use
    )
  );
