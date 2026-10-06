-- Doctors are named by title and first name throughout the office: "Dr. Robert",
-- "Dr. Jennie", "Dr. Nicole", "Dr. Natalie". The roster keeps every person's
-- structured name (first, middle initial, last) for records, and a title column
-- decides how the stored display name is built:
--   title set   -> display_name = "<title> <first name>"   ("Dr. Robert")
--   title empty -> display_name = "First M Last"           (unchanged)
-- Only "Dr." is accepted for now; the team form offers exactly that.

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS title text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_title_check') THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_title_check CHECK (title IS NULL OR title IN ('Dr.'));
  END IF;
END $$;
COMMENT ON COLUMN public.employees.title IS
  'Honorific a person goes by instead of a surname: with a title, display_name is "<title> <first_name>".';


-- 1. A display-name change still records the old name as an alias (imports
--    match on it), and now keeps the structured name when the new display
--    name is the titled form of that same name.
CREATE OR REPLACE FUNCTION public.preserve_employee_name_alias()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    NEW.name_aliases := ARRAY(SELECT DISTINCT alias FROM unnest(coalesce(OLD.name_aliases, ARRAY[]::text[]) || ARRAY[OLD.display_name]) AS alias WHERE btrim(alias) <> '');
    IF concat_ws(' ', NEW.first_name, nullif(NEW.middle_initial, ''), NEW.last_name) IS DISTINCT FROM NEW.display_name
       AND (nullif(NEW.title, '') IS NULL OR concat_ws(' ', NEW.title, NEW.first_name) IS DISTINCT FROM NEW.display_name) THEN
      NEW.first_name := NULL;
      NEW.middle_initial := NULL;
      NEW.last_name := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- 2. Saving a team member takes the title. The old seven-argument form goes
--    away so PostgREST has one function to resolve; callers that omit p_title
--    still work through its default.
DROP FUNCTION IF EXISTS public.save_team_member_contact(uuid, uuid, text, text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.save_team_member_contact(
  p_org_id uuid,
  p_employee_id uuid,
  p_first_name text,
  p_middle_initial text,
  p_last_name text,
  p_email text,
  p_contact jsonb DEFAULT NULL,
  p_title text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_middle text := nullif(upper(regexp_replace(btrim(coalesce(p_middle_initial, '')), '\.$', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_display text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(p_org_id) THEN
    RAISE EXCEPTION 'Owner or manager access required' USING ERRCODE = '42501';
  END IF;
  IF v_first = '' OR v_last = '' THEN
    RAISE EXCEPTION 'First and last name are required' USING ERRCODE = '22023';
  END IF;
  IF v_middle IS NOT NULL AND (char_length(v_middle) <> 1 OR v_middle !~ '^[[:alpha:]]$') THEN
    RAISE EXCEPTION 'Enter one letter for the middle initial' USING ERRCODE = '22023';
  END IF;
  IF v_title IS NOT NULL THEN
    IF v_title ~* '^(dr\.?|doctor)$' THEN
      v_title := 'Dr.';
    ELSE
      RAISE EXCEPTION 'The only title offered is Dr.' USING ERRCODE = '22023';
    END IF;
  END IF;
  -- A titled person is known by title and first name ("Dr. Robert"); the
  -- surname stays on the record.
  v_display := CASE WHEN v_title IS NULL THEN concat_ws(' ', v_first, v_middle, v_last) ELSE v_title || ' ' || v_first END;
  IF p_employee_id IS NULL THEN
    INSERT INTO public.employees (org_id, first_name, middle_initial, last_name, title, display_name, email, timezone)
    VALUES (p_org_id, v_first, v_middle, v_last, v_title, v_display, v_email, NULL)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.employees
    SET first_name = v_first, middle_initial = v_middle, last_name = v_last, title = v_title,
        display_name = v_display, email = v_email
    WHERE id = p_employee_id AND org_id = p_org_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Team member not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  IF p_contact IS NOT NULL THEN
    UPDATE public.employees SET
      phone = nullif(btrim(p_contact->>'phone'), ''),
      alternate_phone = nullif(btrim(p_contact->>'alternate_phone'), ''),
      address_line1 = nullif(btrim(p_contact->>'address_line1'), ''),
      address_line2 = nullif(btrim(p_contact->>'address_line2'), ''),
      city = nullif(btrim(p_contact->>'city'), ''),
      state_region = nullif(btrim(p_contact->>'state_region'), ''),
      postal_code = nullif(btrim(p_contact->>'postal_code'), ''),
      country = nullif(btrim(p_contact->>'country'), ''),
      emergency_contact_name = nullif(btrim(p_contact->>'emergency_contact_name'), ''),
      emergency_contact_relationship = nullif(btrim(p_contact->>'emergency_contact_relationship'), ''),
      emergency_contact_phone = nullif(btrim(p_contact->>'emergency_contact_phone'), ''),
      emergency_contact_alternate_phone = nullif(btrim(p_contact->>'emergency_contact_alternate_phone'), '')
    WHERE id = v_id AND org_id = p_org_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_team_member_contact(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_member_contact(uuid, uuid, text, text, text, text, jsonb, text) TO authenticated;
