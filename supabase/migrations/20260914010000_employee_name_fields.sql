-- Keep explicit name parts for edits without guessing compound names.
-- Existing display_name values remain untouched for attendance import matching.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS middle_initial text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS alternate_phone text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_region text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS name_aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_alternate_phone text;

-- Narrow manager operation: no auth accounts, roles, or onboarding documents
-- are changed. Completed onboarding does not lock roster contact details.
CREATE OR REPLACE FUNCTION public.save_team_member_contact(
  p_org_id uuid,
  p_employee_id uuid,
  p_first_name text,
  p_middle_initial text,
  p_last_name text,
  p_email text,
  p_contact jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_middle text := nullif(upper(regexp_replace(btrim(coalesce(p_middle_initial, '')), '\.$', '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
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
  v_display := concat_ws(' ', v_first, v_middle, v_last);
  IF p_employee_id IS NULL THEN
    INSERT INTO public.employees (org_id, first_name, middle_initial, last_name, display_name, email, timezone)
    VALUES (p_org_id, v_first, v_middle, v_last, v_display, v_email, NULL)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.employees
    SET first_name = v_first, middle_initial = v_middle, last_name = v_last,
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
REVOKE ALL ON FUNCTION public.save_team_member_contact(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_team_member_contact(uuid, uuid, text, text, text, text, jsonb) TO authenticated;


-- Keep old import names attached to the same immutable employee id, including
-- changes made when an invitation is accepted or another editor saves a name.
CREATE OR REPLACE FUNCTION public.preserve_employee_name_alias()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    NEW.name_aliases := ARRAY(SELECT DISTINCT alias FROM unnest(coalesce(OLD.name_aliases, ARRAY[]::text[]) || ARRAY[OLD.display_name]) AS alias WHERE btrim(alias) <> '');
    IF concat_ws(' ', NEW.first_name, nullif(NEW.middle_initial, ''), NEW.last_name) IS DISTINCT FROM NEW.display_name THEN
      NEW.first_name := NULL;
      NEW.middle_initial := NULL;
      NEW.last_name := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS employees_preserve_name_alias ON public.employees;
CREATE TRIGGER employees_preserve_name_alias BEFORE UPDATE OF display_name ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.preserve_employee_name_alias();


-- Shared favorites must actually save before onboarding is marked complete.
-- This writes only the caller's own preferences, never identity or permissions.
CREATE OR REPLACE FUNCTION public.save_employee_onboarding_preferences(
  p_employee_id uuid, p_learning_style text, p_favorites jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_favorites IS NOT NULL AND jsonb_typeof(p_favorites) <> 'object' THEN
    RAISE EXCEPTION 'Favorites must be an object' USING ERRCODE='22023';
  END IF;
  UPDATE public.employees e
  SET learning_style=coalesce(p_learning_style,e.learning_style), favorites=coalesce(p_favorites,e.favorites)
  WHERE e.id=p_employee_id AND e.user_id=auth.uid()
    AND EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id=e.org_id AND m.user_id=auth.uid() AND m.status='active')
  RETURNING e.id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Employee access required' USING ERRCODE='42501'; END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_employee_onboarding_preferences(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_employee_onboarding_preferences(uuid,text,jsonb) TO authenticated;
