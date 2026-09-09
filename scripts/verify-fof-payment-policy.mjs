/** Isolated PostgreSQL probe, no network or production connection.
 * Run: node scripts/verify-fof-payment-policy.mjs [path-to-pglite-module]
 * Requires @electric-sql/pglite, installed separately for this optional local probe.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = name => fs.readFileSync(`supabase/migrations/${name}`, 'utf8');
await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
CREATE TABLE public.orgs(id uuid PRIMARY KEY,name text);
CREATE TABLE public.org_members(org_id uuid,user_id uuid,role text,status text);
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now(); RETURN NEW; END;$$;
CREATE TABLE public.fof_code_names(org_id uuid,code text,patient_name text, UNIQUE(org_id,code));`);
const helper = migration('20260218191828_a5f49fd2-7986-4bb3-98cc-f247619c0d06.sql');
for (const name of ['is_org_member', 'is_org_admin']) {
  const start = helper.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = helper.indexOf('$$;', start) + 3;
  assert(start >= 0 && end > start); await db.exec(helper.slice(start,end));
}
await db.exec(migration('20260722150000_fof_templates.sql'));
const security = migration('20260723170000_fof_security_review.sql');
await db.exec(security.slice(security.indexOf('DROP POLICY'), security.indexOf('-- 1b)')));
await db.exec(migration('20260805220000_procedure_metadata.sql'));
await db.exec(migration('20260909220000_fof_payment_policy.sql'));
const a='852fc8e0-4071-499b-b655-f86d6f789cd5',b='00000000-0000-4000-8000-000000000002';
const owner='00000000-0000-4000-8000-000000000011',employee='00000000-0000-4000-8000-000000000012';
await db.exec(`INSERT INTO orgs VALUES ('${a}','A'),('${b}','B'); INSERT INTO fof_settings(org_id) VALUES('${a}'),('${b}');
INSERT INTO org_members VALUES('${a}','${owner}','owner','active'),('${a}','${employee}','employee','active');
GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,INSERT,UPDATE,DELETE ON fof_settings,procedure_meta TO authenticated;`);
await db.exec(migration('20260909220100_harelick_payment_policy.sql'));
assert.equal((await db.query(`SELECT payment_policy IS NULL AS untouched FROM fof_settings WHERE org_id='${b}'`)).rows[0].untouched,true);
assert.equal((await db.query(`SELECT payment_class FROM procedure_meta WHERE org_id='${a}' AND code='D6190'`)).rows[0].payment_class,'workup');
await assert.rejects(db.exec(`UPDATE fof_settings SET payment_policy='{"version":1}' WHERE org_id='${a}'`));
await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${owner}';`);
assert.equal((await db.query('SELECT * FROM fof_settings')).rows.length,1);
assert.equal((await db.query(`UPDATE fof_settings SET payment_policy=NULL WHERE org_id='${b}' RETURNING org_id`)).rows.length,0);
await assert.rejects(db.exec(`INSERT INTO procedure_meta(org_id,code,payment_class) VALUES('${b}','D6190','workup')`));
assert.equal((await db.query(`UPDATE procedure_meta SET payment_class='review' WHERE org_id='${a}' AND code='D6190' RETURNING code`)).rows.length,1);
await db.exec(`SET request.jwt.claim.sub='${employee}';`);
assert.equal((await db.query(`SELECT * FROM fof_settings`)).rows.length,1);
assert.equal((await db.query(`UPDATE fof_settings SET payment_policy=NULL WHERE org_id='${a}' RETURNING org_id`)).rows.length,0);
assert.equal((await db.query(`UPDATE procedure_meta SET payment_class='implant' WHERE org_id='${a}' RETURNING code`)).rows.length,0);
await db.close();
console.log('PostgreSQL probes passed: migration, targeted seed, validation, member reads, owner writes, cross-office denial, employee write denial.');

