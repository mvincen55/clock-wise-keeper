# Working agreements

## Check with me first

**Ask before publishing or touching production.** That means: deploying the
Lovable project, and any write to the production database — migrations
included. Show me the options and let me choose; don't take the step and
report it afterwards.

Building, committing, and pushing to a branch don't need a check-in. Opening
a pull request needs an explicit ask.

## Migrations

Lovable's GitHub sync does **not** apply files in `supabase/migrations/`.
A merged migration reaches nothing on its own — the schema ledger
(`supabase_migrations.schema_migrations`) does not match the repo's migration
filenames, and today's `incident_reports` table was in the database while its
migration file had never been recorded there.

So the workflow is:

1. Write the migration file into `supabase/migrations/` as normal, and merge it.
2. Ask me before applying it.
3. Apply the SQL to the production database (the Lovable `query_database` tool
   takes DDL, and multi-statement `BEGIN; … COMMIT;` blocks work).
4. Verify afterwards and report what you found — columns, functions, triggers,
   indexes, and the `authenticated` / `anon` grants.

Migration files are still the source of truth. The repo and the database
having drifted apart once is the reason step 4 exists.

## Testing against production

The database is real and small — one org, a handful of employees. Prefer a
transaction that sets up synthetic rows, exercises the rules, and ends in
`ROLLBACK`: it tests role combinations that don't exist yet and leaves nothing
behind, which beats creating a row and deleting it.

To act as a real user inside such a test:

```sql
PERFORM set_config('request.jwt.claim.sub', <user_uuid>::text, true);
PERFORM set_config('request.jwt.claims',
  json_build_object('sub', <user_uuid>, 'role','authenticated')::text, true);
EXECUTE 'SET LOCAL ROLE authenticated';
```

`SET LOCAL ROLE authenticated` is what makes RLS and the column-guard triggers
behave as they do for a signed-in user — without it `current_user` is the
owner and every guard early-returns, so the test proves nothing. Switch back
with `SET LOCAL ROLE NONE` to read results. Grant the temp results table to
`authenticated` or the inserts fail.

## Where things live

- **Lovable project** `1fc9eedc-91d9-4d4f-a24d-aba0b1c277e1`, tracking `main`.
  It syncs a merge within a couple of minutes; check `latest_commit_sha`
  before publishing.
- **Live site** https://timekeepers.me — `clock-wise-keeper.lovable.app`
  redirects there.
- **Supabase project** `lfiplzmxpmybtbzhmnkp` (provisioned by Lovable Cloud;
  it is a real Supabase project underneath).
- `src/integrations/supabase/types.ts` is generated, but has been hand-edited
  when no Supabase access token was available. Verify it against the live
  schema rather than trusting it.

## House style

Match the surrounding code. Comments in this repo explain *why* a rule exists
and what breaks without it, in plain sentences — keep that voice rather than
labelling the obvious.
