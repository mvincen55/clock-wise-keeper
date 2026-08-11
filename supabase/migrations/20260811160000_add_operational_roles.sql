-- Two new operational roles: assistant office manager and treatment
-- coordinator. Operational roles describe the WORK a person does; permission
-- tiers (owner/manager/employee) are untouched — an assistant office manager
-- is a role label, never a widened permission.
--
-- The role vocabulary is enforced in six CHECK constraints; each is dropped
-- and re-added with the expanded list. Replay-safe: DROP IF EXISTS + ADD runs
-- identically on a clean database and on production, and existing rows all
-- use tokens that remain valid.

ALTER TABLE public.employee_operational_roles
  DROP CONSTRAINT IF EXISTS employee_operational_roles_role_check;
ALTER TABLE public.employee_operational_roles
  ADD CONSTRAINT employee_operational_roles_role_check CHECK (
    operational_role = ANY (ARRAY[
      'dentist','hygienist','dental_assistant','front_desk','treatment_coordinator',
      'office_manager','assistant_office_manager','sterilization','floater','other'
    ])
  );

ALTER TABLE public.org_invites
  DROP CONSTRAINT IF EXISTS org_invites_operational_role_check;
ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_operational_role_check CHECK (
    operational_role IS NULL OR operational_role = ANY (ARRAY[
      'dentist','hygienist','dental_assistant','front_desk','treatment_coordinator',
      'office_manager','assistant_office_manager','sterilization','floater','other'
    ])
  );

ALTER TABLE public.org_invites
  DROP CONSTRAINT IF EXISTS org_invites_secondary_roles_check;
ALTER TABLE public.org_invites
  ADD CONSTRAINT org_invites_secondary_roles_check CHECK (
    secondary_roles <@ ARRAY[
      'dentist','hygienist','dental_assistant','front_desk','treatment_coordinator',
      'office_manager','assistant_office_manager','sterilization','floater','other'
    ]
  );

ALTER TABLE public.schedule_staffing_rules
  DROP CONSTRAINT IF EXISTS schedule_staffing_rules_roles_check;
ALTER TABLE public.schedule_staffing_rules
  ADD CONSTRAINT schedule_staffing_rules_roles_check CHECK (
    provider_role = ANY (ARRAY[
      'dentist','hygienist','dental_assistant','front_desk','treatment_coordinator',
      'office_manager','assistant_office_manager','sterilization','floater','other'
    ])
    AND (support_role IS NULL OR support_role = ANY (ARRAY[
      'dentist','hygienist','dental_assistant','front_desk','treatment_coordinator',
      'office_manager','assistant_office_manager','sterilization','floater','other'
    ]))
  );

ALTER TABLE public.provider_day_metrics
  DROP CONSTRAINT IF EXISTS provider_day_metrics_role_check;
ALTER TABLE public.provider_day_metrics
  ADD CONSTRAINT provider_day_metrics_role_check CHECK (
    provider_role = ANY (ARRAY[
      'dentist','hygienist','dental_assistant','front_desk','treatment_coordinator',
      'office_manager','assistant_office_manager','sterilization','floater','other'
    ])
  );

ALTER TABLE public.team_goals
  DROP CONSTRAINT IF EXISTS team_goals_scope_role_check;
ALTER TABLE public.team_goals
  ADD CONSTRAINT team_goals_scope_role_check CHECK (
    scope_role IS NULL OR scope_role IN (
      'dentist','hygienist','dental_assistant','front_desk','treatment_coordinator',
      'office_manager','assistant_office_manager','sterilization','floater','other'
    )
  );
