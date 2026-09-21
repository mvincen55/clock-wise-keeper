-- Missed appointments as Dentrix posts them.
--
-- 9100 is the office's no-show code and 9101 its late-cancellation code.
-- Management → Missed appointments imports the Dentrix "Appt_Date /
-- Appt_Provider" export and keeps one row per posting: the appointment
-- date, the code, the provider whose chair went empty, the department that
-- provider works in, and (when the export carries a ProvID column) the code
-- of the patient's primary provider. Nothing about the patient is stored;
-- the importer discards the PatID column before a row is built, and this
-- table has no column that could take it.
--
-- These rows are the postings themselves and stay separate from the counts
-- the close-the-day deposit log captures per day (deposit_logs.*_no_shows,
-- *_cancellations): the two are different measures taken at different
-- moments, so neither overwrites the other.
--
-- Re-importing the same export is a no-op: rows are keyed by
-- (office, date, code, provider name, ordinal), where the ordinal numbers
-- identical postings on one day for one provider.

CREATE TABLE public.missed_appointment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
 business_date date NOT NULL,
 code text NOT NULL CHECK (code IN ('9100','9101')),
 provider_name text NOT NULL CHECK (length(btrim(provider_name)) BETWEEN 1 AND 120),
 provider_id uuid REFERENCES public.org_providers(id) ON DELETE SET NULL,
 department text NOT NULL DEFAULT 'other' CHECK (department IN ('doctor','hygiene','other')),
 primary_provider_code text CHECK (primary_provider_code IS NULL OR length(btrim(primary_provider_code)) BETWEEN 1 AND 20),
 ordinal integer NOT NULL DEFAULT 1 CHECK (ordinal >= 1),
 source text NOT NULL DEFAULT 'dentrix_import' CHECK (source IN ('dentrix_import','manual')),
 imported_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (org_id, business_date, code, provider_name, ordinal)
);
COMMENT ON TABLE public.missed_appointment_events IS 'Dentrix 9100 (no-show) and 9101 (late cancellation) postings, one row each; no patient identifiers.';

-- The provider a posting points at must belong to the same office.
CREATE OR REPLACE FUNCTION public.missed_appointment_event_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.provider_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.org_providers p WHERE p.id = NEW.provider_id AND p.org_id = NEW.org_id
 ) THEN
  RAISE EXCEPTION 'The provider does not belong to this office' USING ERRCODE = '23503';
 END IF;
 NEW.provider_name := btrim(NEW.provider_name);
 NEW.primary_provider_code := NULLIF(upper(btrim(NEW.primary_provider_code)), '');
 RETURN NEW;
END $$;
CREATE TRIGGER missed_appointment_event_guard
 BEFORE INSERT OR UPDATE ON public.missed_appointment_events
 FOR EACH ROW EXECUTE FUNCTION public.missed_appointment_event_guard();
CREATE TRIGGER missed_appointment_events_updated_at
 BEFORE UPDATE ON public.missed_appointment_events
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.missed_appointment_events ENABLE ROW LEVEL SECURITY;
-- Every active member can read the office's postings (schedule disruption
-- is office data, not personal data); only owners and managers record them.
CREATE POLICY missed_appointment_read ON public.missed_appointment_events FOR SELECT TO authenticated
 USING (public.is_org_member(org_id));
CREATE POLICY missed_appointment_insert ON public.missed_appointment_events FOR INSERT TO authenticated
 WITH CHECK (public.is_org_admin(org_id) AND imported_by = auth.uid());
CREATE POLICY missed_appointment_update ON public.missed_appointment_events FOR UPDATE TO authenticated
 USING (public.is_org_admin(org_id)) WITH CHECK (public.is_org_admin(org_id));
CREATE POLICY missed_appointment_delete ON public.missed_appointment_events FOR DELETE TO authenticated
 USING (public.is_org_admin(org_id));
REVOKE ALL ON public.missed_appointment_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missed_appointment_events TO authenticated;
GRANT ALL ON public.missed_appointment_events TO service_role;
CREATE INDEX missed_appointment_events_org_date ON public.missed_appointment_events (org_id, business_date);
CREATE INDEX missed_appointment_events_provider ON public.missed_appointment_events (provider_id) WHERE provider_id IS NOT NULL;
