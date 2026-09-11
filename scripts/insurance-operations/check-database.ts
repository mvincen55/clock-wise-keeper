const { PGlite } = await import(
  process.env.PGLITE_MODULE || '@electric-sql/pglite'
);
import { readFileSync } from 'node:fs';
import { defaultSettings } from '../../src/features/insurance-operations/domain/schema';
import { syntheticPlan } from '../../src/features/insurance-operations/domain/synthetic';
const db = new PGlite();
const org = '00000000-0000-4000-8000-000000000002',
  other = '00000000-0000-4000-8000-000000000009',
  user = '00000000-0000-4000-8000-000000000005',
  employee = '00000000-0000-4000-8000-000000000006',
  outsider = '00000000-0000-4000-8000-000000000007',
  payer = '00000000-0000-4000-8000-000000000001';
await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
create table orgs(id uuid primary key);create table org_members(org_id uuid,user_id uuid,role text,status text);create table important_numbers(id uuid primary key,org_id uuid);create table org_providers(id uuid primary key,org_id uuid,active boolean);create table insurance_plans(id uuid primary key,org_id uuid);create table fee_schedules(id uuid primary key,org_id uuid);create table office_docs(id uuid primary key,org_id uuid);
create function is_allowed_user() returns boolean language sql stable as $$select auth.uid() is not null$$;
create function is_org_member(o uuid) returns boolean language sql security definer stable as $$select exists(select 1 from org_members where org_id=o and user_id=auth.uid() and status='active')$$;
create function is_org_admin(o uuid) returns boolean language sql security definer stable as $$select exists(select 1 from org_members where org_id=o and user_id=auth.uid() and status='active' and role in ('owner','manager'))$$;
insert into orgs values('${org}'),('${other}');insert into auth.users values('${user}'),('${employee}'),('${outsider}');insert into org_members values('${org}','${user}','owner','active'),('${org}','${employee}','employee','active'),('${other}','${outsider}','owner','active');insert into important_numbers values('${payer}','${org}');`);
await db.exec(
  readFileSync(
    new URL(
      '../../supabase/migrations/20260911201150_12a42b7e-f779-4aa7-9075-dbfb4c7553b8.sql',
      import.meta.url,
    ),
    'utf8',
  ),
);
let passed = 0;
async function asUser(who: string, action: () => Promise<unknown>) {
  await db.exec('begin;set local role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [who]);
  try {
    const result = await action();
    await db.exec('commit');
    return result;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
async function check(
  name: string,
  action: () => Promise<unknown>,
  reject = false,
) {
  let failed = false;
  try {
    await action();
  } catch {
    failed = true;
  }
  if (failed !== reject) throw new Error(`FAILED: ${name}`);
  passed++;
  console.log(`PASS ${name}`);
}
const settings = { ...structuredClone(defaultSettings), enabled: true };
const save = (who: string, version: number, config: unknown) =>
  asUser(who, () =>
    db.query('select insurance_save_settings($1,$2,$3)', [
      org,
      version,
      JSON.stringify(config),
    ]),
  );
await check('manager writes settings', () => save(user, 0, settings));
await check(
  'employee cannot write settings',
  () => save(employee, 1, settings),
  true,
);
await check(
  'cross-office cannot write settings',
  () => save(outsider, 1, settings),
  true,
);
await check(
  'optimistic version rejects stale settings',
  () => save(user, 0, settings),
  true,
);
await check(
  'raw patient key rejected from settings',
  () => save(user, 1, { ...settings, memberId: '00001' }),
  true,
);
await check(
  'nested patient preset key rejected',
  () =>
    save(user, 1, {
      ...settings,
      presets: {
        ...settings.presets,
        breakdown: { ...settings.presets.breakdown, patientName: 'X' },
      },
    }),
  true,
);
await check(
  'missing preset limits rejected',
  () =>
    save(user, 1, {
      ...settings,
      presets: {
        ...settings.presets,
        breakdown: {
          questions: settings.presets.breakdown.questions,
          limits: {},
        },
      },
    }),
  true,
);
await check('cross-office reads see no settings', () =>
  asUser(outsider, async () => {
    const r = await db.query('select * from insurance_operation_settings');
    if (r.rows.length) throw new Error('leak');
  }),
);
await check(
  'direct settings write denied',
  () =>
    asUser(user, () =>
      db.query('update insurance_operation_settings set enabled=false'),
    ),
  true,
);
const p = syntheticPlan();
const {
  payerId,
  groupRaw,
  product,
  subgroup,
  network,
  providerId,
  effectiveFrom,
  effectiveTo,
  benefitYear,
  insurancePlanId,
  feeScheduleId,
  manualId,
  source,
  sourceDate,
  confidence,
  rules,
} = p;
const reference = {
  payerId,
  groupRaw,
  product,
  subgroup,
  network,
  providerId,
  effectiveFrom,
  effectiveTo,
  benefitYear,
  insurancePlanId,
  feeScheduleId,
  manualId,
  source,
  sourceDate,
  confidence,
  rules,
};
const publish = (who: string, ref: unknown, reviewed = true) =>
  asUser(who, () =>
    db.query('select insurance_publish_plan($1,null,0,$2,$3)', [
      org,
      JSON.stringify(ref),
      reviewed,
    ]),
  );
await check('manager publishes allowlisted reviewed plan', () =>
  publish(user, reference),
);
await check(
  'member accumulators rejected',
  () =>
    publish(user, {
      ...reference,
      rules: [
        {
          key: 'remaining_maximum',
          scope: 'plan',
          status: 'confirmed',
          value: 1200,
        },
      ],
    }),
  true,
);
await check(
  'nested transcript rejected',
  () =>
    publish(user, {
      ...reference,
      rules: [
        { ...rules[0], value: { ...rules[0].value, transcript: 'patient' } },
      ],
    }),
  true,
);
await check(
  'patient top-level field rejected',
  () => publish(user, { ...reference, memberId: '001' }),
  true,
);
await check(
  'source review required',
  () => publish(user, reference, false),
  true,
);
await check(
  'employee cannot publish',
  () => publish(employee, reference),
  true,
);
await check(
  'cross-office cannot publish',
  () => publish(outsider, reference),
  true,
);
await check(
  'cross-office references rejected',
  () => publish(user, { ...reference, payerId: other }),
  true,
);
await check(
  'direct version mutation denied',
  () =>
    asUser(user, () =>
      db.query("update insurance_plan_versions set status='superseded'"),
    ),
  true,
);
await check('cross-office versions invisible', () =>
  asUser(outsider, async () => {
    const r = await db.query('select * from insurance_plan_versions');
    if (r.rows.length) throw new Error('leak');
  }),
);
console.log(
  `${passed} local PostgreSQL migration/RLS checks passed. This is not the full Supabase migration replay gate.`,
);
await db.close();
