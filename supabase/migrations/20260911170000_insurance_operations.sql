-- Non-patient configuration only. No task, member, call, fax or transcript table.
create table public.insurance_operation_settings (
  org_id uuid primary key references public.orgs(id) on delete cascade,
  version integer not null check (version > 0),
  enabled boolean not null default false,
  configuration jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.insurance_plan_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  catalog_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'reviewed' check (status in ('reviewed','superseded')),
  group_normalized text not null,
  reference jsonb not null,
  reviewed_at timestamptz not null default now(),
  reviewer_id uuid not null references auth.users(id),
  unique (org_id, catalog_id, version)
);
create index insurance_plan_versions_office on public.insurance_plan_versions(org_id, group_normalized);
alter table public.insurance_operation_settings enable row level security;
alter table public.insurance_plan_versions enable row level security;
create policy insurance_settings_read on public.insurance_operation_settings for select to authenticated using (public.is_allowed_user() and public.is_org_member(org_id));
create policy insurance_versions_read on public.insurance_plan_versions for select to authenticated using (public.is_allowed_user() and public.is_org_member(org_id));
revoke all on public.insurance_operation_settings, public.insurance_plan_versions from anon, authenticated;
grant select on public.insurance_operation_settings, public.insurance_plan_versions to authenticated;

-- Fail closed on extra keys. This protects against raw model JSON/member fields,
-- including nested content disguised as generic rules.
create function public.io_keys(value jsonb, allowed text[]) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(value) = 'object' and not exists (
    select 1 from jsonb_object_keys(value) k where not (k = any(allowed))
  );
$$;
revoke all on function public.io_keys(jsonb,text[]) from public, anon, authenticated;

create function public.io_validate_reference(value jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare r jsonb; v jsonb; k text;
begin
  if not public.io_keys(value, array['payerId','groupRaw','product','subgroup','network','providerId','effectiveFrom','effectiveTo','benefitYear','insurancePlanId','feeScheduleId','manualId','source','sourceDate','confidence','rules']) then return false; end if;
  foreach k in array array['payerId','groupRaw','product','subgroup','network','effectiveFrom','effectiveTo','benefitYear','source','sourceDate','confidence'] loop
    if jsonb_typeof(value->k) is distinct from 'string' or length(value->>k) not between 1 and 160 then return false; end if;
  end loop;
  if value->>'confidence' not in ('high','medium','low') or (value->>'effectiveFrom')::date > (value->>'effectiveTo')::date then return false; end if;
  if jsonb_typeof(value->'rules') is distinct from 'array' or jsonb_array_length(value->'rules') not between 1 and 100 then return false; end if;
  if exists(select 1 from jsonb_array_elements(value->'rules') x group by x->>'key',x->>'scope' having count(*) > 1) then return false; end if;
  for r in select * from jsonb_array_elements(value->'rules') loop
    if jsonb_typeof(r->'key') is distinct from 'string' or jsonb_typeof(r->'scope') is distinct from 'string' or jsonb_typeof(r->'status') is distinct from 'string' then return false; end if;
    if not public.io_keys(r,array['key','scope','status','value']) or r->>'key' not in ('coverage','individual_deductible','family_deductible','annual_plan_maximum','deductible_applies','benefit_year','waiting_period','missing_tooth','downgrade','age_limit','frequency','shared_frequency','exclusion','limitation') or r->>'scope' !~ '^(plan|preventive|basic|major|diagnostic|orthodontic|D[0-9]{4})$' or r->>'status' not in ('confirmed','unknown','conflicting') then return false; end if;
    if not (r ?& array['key','scope','status','value']) then return false; end if;
    v := r->'value';
    if v = 'null'::jsonb then
      if r->>'status' = 'confirmed' then return false; end if;
    elsif jsonb_typeof(v) = 'boolean' then
      if r->>'key' in ('coverage','individual_deductible','family_deductible','annual_plan_maximum') then return false; end if;
    elsif jsonb_typeof(v) = 'object' and v ? 'amount' then
      if jsonb_typeof(v->'unit') is distinct from 'string' or jsonb_typeof(v->'window') is distinct from 'string' then return false; end if;
      if not public.io_keys(v,array['amount','unit','window','windowMonths']) or not (v ?& array['amount','unit','window','windowMonths']) or jsonb_typeof(v->'amount') <> 'number' or (v->>'amount')::numeric not between 0 and 10000000 or v->>'unit' not in ('percent','USD','visits','months','years','days') or v->>'window' not in ('none','calendar_year','benefit_year','rolling_months','lifetime') then return false; end if;
      if v->'windowMonths' <> 'null'::jsonb and (v->>'windowMonths')::integer not between 1 and 1200 then return false; end if;
      if r->>'key' = 'coverage' and (v->>'unit' <> 'percent' or (v->>'amount')::numeric > 100) then return false; end if;
      if r->>'key' in ('individual_deductible','family_deductible','annual_plan_maximum') and v->>'unit' <> 'USD' then return false; end if;
    elsif jsonb_typeof(v) = 'object' and v ? 'meaning' then
      if not (v ?& array['meaning','codes']) or jsonb_typeof(v->'meaning') is distinct from 'string' or jsonb_typeof(v->'codes') is distinct from 'array' then return false; end if;
      if not public.io_keys(v,array['meaning','codes']) or v->>'meaning' not in ('applies','does_not_apply','calendar_year','contract_year','not_covered','covered','alternate_benefit','shared_limit') or jsonb_typeof(v->'codes') <> 'array' or jsonb_array_length(v->'codes') > 30 or r->>'key' in ('coverage','individual_deductible','family_deductible','annual_plan_maximum') then return false; end if;
      if exists(select 1 from jsonb_array_elements_text(v->'codes') code where code !~ '^D[0-9]{4}$') then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.io_validate_reference(jsonb) from public, anon, authenticated;

create function public.io_validate_preset(value jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare q jsonb; limits jsonb;
begin
  if not public.io_keys(value,array['questions','limits']) or not (value ?& array['questions','limits']) or jsonb_typeof(value->'questions') is distinct from 'array' then return false; end if;
  limits := value->'limits';
  if not public.io_keys(limits,array['holdSeconds','totalSeconds','retries']) or not (limits ?& array['holdSeconds','totalSeconds','retries']) then return false; end if;
  if jsonb_typeof(limits->'holdSeconds') is distinct from 'number' or jsonb_typeof(limits->'totalSeconds') is distinct from 'number' or jsonb_typeof(limits->'retries') is distinct from 'number' then return false; end if;
  if (limits->>'holdSeconds')::integer not between 30 and 3600 or (limits->>'totalSeconds')::integer not between 60 and 7200 or (limits->>'retries')::integer not between 0 and 2 or (limits->>'holdSeconds')::integer > (limits->>'totalSeconds')::integer or jsonb_array_length(value->'questions') not between 1 and 60 then return false; end if;
  for q in select * from jsonb_array_elements(value->'questions') loop
    if not public.io_keys(q,array['key','scope','required']) or not (q ?& array['key','scope','required']) or jsonb_typeof(q->'key') is distinct from 'string' or jsonb_typeof(q->'scope') is distinct from 'string' or jsonb_typeof(q->'required') is distinct from 'boolean' then return false; end if;
    if q->>'key' not in ('coverage','individual_deductible','family_deductible','annual_plan_maximum','deductible_applies','benefit_year','waiting_period','missing_tooth','downgrade','age_limit','frequency','shared_frequency','exclusion','limitation','eligible','effective_dates','remaining_deductible','remaining_maximum','remaining_frequency') or q->>'scope' !~ '^(plan|preventive|basic|major|diagnostic|orthodontic|D[0-9]{4})$' then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;
revoke all on function public.io_validate_preset(jsonb) from public, anon, authenticated;

create function public.insurance_save_settings(p_org_id uuid, p_expected_version integer, p_configuration jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare current_version integer; mapping jsonb; preset jsonb; q jsonb; kind text; bundle jsonb; override_value jsonb;
begin
  if not public.is_allowed_user() or not public.is_org_admin(p_org_id) then raise exception 'Not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 111));
  select version into current_version from public.insurance_operation_settings where org_id = p_org_id;
  if coalesce(current_version,0) <> p_expected_version then raise exception 'Settings changed; reload before saving'; end if;
  if not public.io_keys(p_configuration,array['version','enabled','defaultKind','defaultDelivery','presets','bundles','carrierOverrides','mappings','concurrency','spendingLimitCents','freshnessDays','roles','alerts']) or not (p_configuration ?& array['version','enabled','defaultKind','defaultDelivery','presets','bundles','carrierOverrides','mappings','concurrency','spendingLimitCents','freshnessDays','roles','alerts']) then raise exception 'Invalid configuration'; end if;
  if (p_configuration->>'concurrency')::integer not between 1 and 3 or (p_configuration->>'spendingLimitCents')::integer not between 0 and 10000 or (p_configuration->>'freshnessDays')::integer not between 1 and 365 or p_configuration->>'defaultKind' not in ('breakdown','eligibility','combined') or p_configuration->>'defaultDelivery' not in ('answers','fax','answers_and_fax') or jsonb_typeof(p_configuration->'enabled') <> 'boolean' then raise exception 'Invalid limits'; end if;
  if jsonb_typeof(p_configuration->'roles') <> 'array' or jsonb_array_length(p_configuration->'roles') < 1 or exists(select 1 from jsonb_array_elements_text(p_configuration->'roles') role where role not in ('owner','manager','employee')) then raise exception 'Invalid roles'; end if;
  if not public.io_keys(p_configuration->'alerts',array['completion','attention','sound']) or not ((p_configuration->'alerts') ?& array['completion','attention','sound']) or exists(select 1 from jsonb_each(p_configuration->'alerts') a where jsonb_typeof(a.value) <> 'boolean') then raise exception 'Invalid alerts'; end if;
  if not public.io_keys(p_configuration->'presets',array['breakdown','eligibility','combined']) or not ((p_configuration->'presets') ?& array['breakdown','eligibility','combined']) then raise exception 'Invalid presets'; end if;
  for kind, preset in select * from jsonb_each(p_configuration->'presets') loop
    if public.io_validate_preset(preset) is distinct from true then raise exception 'Invalid preset'; end if;
    if not public.io_keys(preset,array['questions','limits']) or not public.io_keys(preset->'limits',array['holdSeconds','totalSeconds','retries']) or jsonb_array_length(preset->'questions') not between 1 and 60 or (preset#>>'{limits,holdSeconds}')::integer not between 30 and 3600 or (preset#>>'{limits,totalSeconds}')::integer not between 60 and 7200 or (preset#>>'{limits,retries}')::integer not between 0 and 2 or (preset#>>'{limits,holdSeconds}')::integer > (preset#>>'{limits,totalSeconds}')::integer then raise exception 'Invalid preset'; end if;
    for q in select * from jsonb_array_elements(preset->'questions') loop
      if not public.io_keys(q,array['key','scope','required']) or q->>'key' not in ('coverage','individual_deductible','family_deductible','annual_plan_maximum','deductible_applies','benefit_year','waiting_period','missing_tooth','downgrade','age_limit','frequency','shared_frequency','exclusion','limitation','eligible','effective_dates','remaining_deductible','remaining_maximum','remaining_frequency') or q->>'scope' !~ '^(plan|preventive|basic|major|diagnostic|orthodontic|D[0-9]{4})$' or jsonb_typeof(q->'required') <> 'boolean' then raise exception 'Invalid question'; end if;
    end loop;
  end loop;
  if jsonb_typeof(p_configuration->'carrierOverrides') is distinct from 'array' or jsonb_array_length(p_configuration->'carrierOverrides') > 20 then raise exception 'Invalid carrier presets'; end if;
  for override_value in select * from jsonb_array_elements(p_configuration->'carrierOverrides') loop
    if not public.io_keys(override_value,array['payerId','kind','preset']) or not (override_value ?& array['payerId','kind','preset']) or override_value->>'kind' not in ('breakdown','eligibility','combined') or public.io_validate_preset(override_value->'preset') is distinct from true then raise exception 'Invalid carrier preset'; end if;
    if not exists(select 1 from public.important_numbers where id = (override_value->>'payerId')::uuid and org_id = p_org_id) then raise exception 'Carrier is outside this office'; end if;
  end loop;
  if jsonb_typeof(p_configuration->'bundles') is distinct from 'array' or jsonb_array_length(p_configuration->'bundles') > 20 or jsonb_typeof(p_configuration->'mappings') is distinct from 'array' or jsonb_array_length(p_configuration->'mappings') > 30 then raise exception 'Invalid bundles or mappings'; end if;
  for bundle in select * from jsonb_array_elements(p_configuration->'bundles') loop
    if not public.io_keys(bundle,array['name','codes']) or not (bundle ?& array['name','codes']) or jsonb_typeof(bundle->'name') is distinct from 'string' or jsonb_typeof(bundle->'codes') is distinct from 'array' or length(bundle->>'name') not between 1 and 160 or jsonb_array_length(bundle->'codes') not between 1 and 30 or exists(select 1 from jsonb_array_elements_text(bundle->'codes') c where c !~ '^D[0-9]{4}$') then raise exception 'Invalid code bundle'; end if;
  end loop;
  for mapping in select * from jsonb_array_elements(p_configuration->'mappings') loop
    if not public.io_keys(mapping,array['role','entryId','providerId','confirmed']) or not (mapping ?& array['role','entryId','providerId','confirmed']) or jsonb_typeof(mapping->'role') is distinct from 'string' or mapping->>'role' not in ('billing_npi','rendering_npi','tax_id','payer_phone','office_fax') or mapping->'confirmed' is distinct from 'true'::jsonb then raise exception 'Invalid mapping'; end if;
    if not exists(select 1 from public.important_numbers where id = (mapping->>'entryId')::uuid and org_id = p_org_id) then raise exception 'Directory entry is outside this office'; end if;
    if mapping->>'providerId' is not null and not exists(select 1 from public.org_providers where id = (mapping->>'providerId')::uuid and org_id = p_org_id and active) then raise exception 'Provider is outside this office'; end if;
  end loop;
  p_configuration := jsonb_set(p_configuration,'{version}',to_jsonb(p_expected_version+1));
  insert into public.insurance_operation_settings(org_id,version,enabled,configuration) values(p_org_id,p_expected_version+1,(p_configuration->>'enabled')::boolean,p_configuration)
  on conflict(org_id) do update set version = excluded.version, enabled = excluded.enabled, configuration = excluded.configuration, updated_at = now();
  return p_configuration;
end;
$$;

create function public.insurance_publish_plan(p_org_id uuid, p_catalog_id uuid, p_expected_version integer, p_reference jsonb, p_reviewed boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare catalog uuid := coalesce(p_catalog_id,gen_random_uuid()); current_version integer; result public.insurance_plan_versions; link_id uuid;
begin
  if not public.is_allowed_user() or not public.is_org_admin(p_org_id) or p_reviewed is distinct from true then raise exception 'Source review by a manager is required'; end if;
  if not public.io_validate_reference(p_reference) then raise exception 'Only reviewed generic plan rules are allowed'; end if;
  if not exists(select 1 from public.important_numbers where id = (p_reference->>'payerId')::uuid and org_id = p_org_id) then raise exception 'Payer is outside this office'; end if;
  link_id := (p_reference->>'insurancePlanId')::uuid;
  if link_id is not null and not exists(select 1 from public.insurance_plans where id = link_id and org_id = p_org_id) then raise exception 'Plan is outside this office'; end if;
  link_id := (p_reference->>'feeScheduleId')::uuid;
  if link_id is not null and not exists(select 1 from public.fee_schedules where id = link_id and org_id = p_org_id) then raise exception 'Schedule is outside this office'; end if;
  link_id := (p_reference->>'manualId')::uuid;
  if link_id is not null and not exists(select 1 from public.office_docs where id = link_id and org_id = p_org_id) then raise exception 'Manual is outside this office'; end if;
  link_id := (p_reference->>'providerId')::uuid;
  if link_id is not null and not exists(select 1 from public.org_providers where id = link_id and org_id = p_org_id) then raise exception 'Provider is outside this office'; end if;
  perform pg_advisory_xact_lock(hashtextextended(catalog::text,112));
  select max(version) into current_version from public.insurance_plan_versions where org_id = p_org_id and catalog_id = catalog;
  if coalesce(current_version,0) <> p_expected_version then raise exception 'Plan changed; review the current version'; end if;
  update public.insurance_plan_versions set status = 'superseded' where org_id = p_org_id and catalog_id = catalog;
  insert into public.insurance_plan_versions(org_id,catalog_id,version,group_normalized,reference,reviewer_id)
  values(p_org_id,catalog,p_expected_version+1,upper(btrim(p_reference->>'groupRaw')),p_reference,auth.uid()) returning * into result;
  return to_jsonb(result);
end;
$$;
revoke all on function public.insurance_save_settings(uuid,integer,jsonb), public.insurance_publish_plan(uuid,uuid,integer,jsonb,boolean) from public, anon;
grant execute on function public.insurance_save_settings(uuid,integer,jsonb), public.insurance_publish_plan(uuid,uuid,integer,jsonb,boolean) to authenticated;
