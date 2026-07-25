# Runbook — one-time setup and the only two admin tasks

## One-time setup (about 30 minutes)

### 1. Supabase (the database) — practice-owned account

1. Create an account at supabase.com under the practice's email, then
   **New project** (free tier). Pick a strong database password and
   save it with the practice's records.
2. **Authentication → Sign In / Up**: disable "Allow new users to sign
   up" (users are created by hand, below). Email confirmations off.
3. **Authentication → Users → Add user**: create the first user
   (email + password). Copy the **User UID**.
4. **SQL Editor**: paste and run `supabase/schema.sql` (whole file).
5. Open `supabase/seed/01-config.sql`, replace `OWNER_AUTH_USER_ID`
   with the User UID from step 3, paste and run it.
6. Paste and run `supabase/seed/02-fee-items.sql` (the fee schedules —
   it's long; the editor handles it).
7. **Project Settings → API**: copy the **Project URL** and the
   **anon/public key** for the next section.

### 2. Build the site

On any computer with Node.js 18+:

```sh
npm install
cp .env.example .env    # paste the Project URL and anon key from 1.7
npm run build           # produces the dist/ folder
```

### 3. Host it — practice-owned account

Cloudflare Pages (recommended) or Netlify, free tier:

- Cloudflare: **Workers & Pages → Create → Pages → Upload assets** →
  drag the `dist/` folder in. Done.
- Custom domain: in the Pages project, **Custom domains → Add** →
  `forms.drharelick.com`, then add the CNAME record it shows in the
  practice's DNS. HTTPS is automatic.

Because the app is frozen there is no redeploy pipeline — if it ever
needs rebuilding, repeat section 2 and re-upload `dist/`.

## Admin task 1 — add a staff member

1. Supabase → **Authentication → Users → Add user** (email + password).
2. **SQL Editor**, run (with the real email):
   ```sql
   INSERT INTO public.allowed_users (email) VALUES ('person@example.com');
   INSERT INTO public.org_members (org_id, user_id, role, status)
   SELECT '852fc8e0-4071-499b-b655-f86d6f789cd5', id, 'employee', 'active'
   FROM auth.users WHERE email = 'person@example.com';
   ```
   Use role `'manager'` instead of `'employee'` for someone who should
   edit templates and fee schedules.

To remove someone: delete their row from `allowed_users` and set their
`org_members.status` to `'disabled'` (or delete the auth user).

## Admin task 2 — wake a paused project

The Supabase free tier pauses a project after about a week with no
traffic. Symptom: the site loads but sign-in/data fails. Fix: log in to
supabase.com → the project shows **Paused** → click **Restore**. Takes
a couple of minutes; nothing is lost. (Using the app weekly prevents
this entirely; upgrading the project to Pro removes pausing.)
