-- Narrow write access for roster codes and onboarding basics. General employee
-- UPDATE remains restricted; managers cannot use this to change other fields.
CREATE OR REPLACE FUNCTION public.save_employee_basics(p_employee_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  target public.employees%ROWTYPE;
  saved public.employees%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    coalesce(public.is_org_admin(target.org_id), false)
    OR (target.user_id = auth.uid() AND public.is_org_member(target.org_id))
  ) IS TRUE THEN
    RAISE EXCEPTION 'You do not have permission to update this employee' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
    OR (p_patch - ARRAY['preferred_name','team','tag']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Only preferred name, team and staff code may be updated';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p_patch) WHERE jsonb_typeof(value) NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'Profile values must be text';
  END IF;
  IF p_patch ? 'tag' AND NOT coalesce(public.is_org_admin(target.org_id), false) THEN
    RAISE EXCEPTION 'Only an office owner or manager can change staff codes' USING ERRCODE = '42501';
  END IF;
  IF p_patch ? 'tag' AND nullif(upper(trim(p_patch->>'tag')), '') IS NOT NULL
    AND upper(trim(p_patch->>'tag')) !~ '^[A-Z0-9]{3,4}$' THEN
    RAISE EXCEPTION 'Staff codes must be 3–4 letters or numbers';
  END IF;
  UPDATE public.employees SET
    preferred_name = CASE WHEN p_patch ? 'preferred_name' THEN nullif(trim(p_patch->>'preferred_name'),'') ELSE preferred_name END,
    team = CASE WHEN p_patch ? 'team' THEN p_patch->>'team' ELSE team END,
    tag = CASE WHEN p_patch ? 'tag' THEN nullif(upper(trim(p_patch->>'tag')),'') ELSE tag END
  WHERE id = p_employee_id RETURNING * INTO saved;
  RETURN jsonb_build_object('id',saved.id,'tag',saved.tag,'preferred_name',saved.preferred_name,'team',saved.team);
END;
$$;
REVOKE ALL ON FUNCTION public.save_employee_basics(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_employee_basics(uuid,jsonb) TO authenticated;

