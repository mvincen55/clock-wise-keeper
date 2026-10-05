-- A confirmed primary operational role is the standing job; starts_on is
-- deliberately NULL. Undated secondary roles are backup capabilities, not
-- assignments, and must never choose a person's review points/call gate.
-- Seed only unset campaign groups from confirmed primary jobs. Never overwrite
-- a campaign manager's group selection. Unknown jobs stay unset.
UPDATE public.fts_participants p
SET scoring_role = mapped.scoring_role, updated_at = now()
FROM (
  SELECT DISTINCT ON (e.id) e.id AS employee_id,
    CASE r.operational_role
      WHEN 'dentist' THEN 'doctor'
      WHEN 'hygienist' THEN 'hygienist'
      WHEN 'dental_assistant' THEN 'assistant'
      WHEN 'front_desk' THEN 'clerical'
      WHEN 'office_manager' THEN 'clerical'
      WHEN 'assistant_office_manager' THEN 'clerical'
      WHEN 'treatment_coordinator' THEN 'clerical'
    END AS scoring_role
  FROM public.employees e
  JOIN public.employee_operational_roles r ON r.employee_id=e.id AND r.org_id=e.org_id
  WHERE e.org_id='852fc8e0-4071-499b-b655-f86d6f789cd5'
    AND e.employment_status='active' AND r.is_primary AND r.confirmed_by IS NOT NULL
  ORDER BY e.id, r.confirmed_at DESC NULLS LAST, r.created_at DESC
) mapped
JOIN public.fts_campaigns c ON c.org_id='852fc8e0-4071-499b-b655-f86d6f789cd5'
  AND c.name='Fill the Schedule' AND c.starts_on='2026-10-01' AND c.ends_on='2026-12-31'
WHERE p.campaign_id=c.id AND p.org_id=c.org_id AND p.employee_id=mapped.employee_id
  AND p.scoring_role IS NULL AND mapped.scoring_role IS NOT NULL;
