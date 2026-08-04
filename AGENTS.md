# AGENTS.md

## Cursor Cloud specific instructions

Purple Envelope is a single-product **Vite + React 18 + TypeScript PWA** (package manager: **Bun**). It has no local backend: the frontend talks to a **hosted Supabase cloud** project using the public URL + anon key committed in `.env` (public by design — RLS is the security perimeter). There is no Docker, database, or local Supabase stack to run for normal development.

### Services

There is only one local service: the **Vite dev server**.

- Start it with `bun run dev`. It serves on **port 8080** (`vite.config.ts`), not the `localhost:5173` mentioned in `README.md`. Both ports are allowlisted for invites, but the server actually binds 8080.
- Standard scripts live in `package.json` (`dev`, `build`, `test`, `typecheck`, `lint`, `check`). CI (`.github/workflows/ci.yml`) runs only `bun run test` and `bun run build`.

### Non-obvious caveats

- **Bun is the package manager.** A `bun.lock` is committed and CI uses `bun install --frozen-lockfile`. Bun is preinstalled in this environment and symlinked to `/usr/local/bin/bun`. Do not use npm/yarn to install (the README's `npm i` still works but Bun matches CI).
- **Lint is intentionally non-blocking.** `bun run lint` reports ~200 pre-existing errors and exits non-zero. The repo wraps it as `lint:report` in `prebuild` precisely because these are expected; `build` never fails on lint. Do not try to "fix" these as part of environment setup.
- **`predev`/`prebuild`/`build` run `scripts/vendor-tesseract.mjs`**, which copies OCR assets from `node_modules` and downloads `eng.traineddata.gz` from a CDN (needs network the first time; afterwards it is cached in the gitignored `public/tesseract/`). If offline, the Schedule Reader OCR feature reports `OCR_ASSETS_MISSING` but the rest of the app is unaffected.
- **The app is invite-only.** `useAuth` runs an `is_allowed_user()` RPC on every session and immediately signs out anyone not in the `allowed_users` table. There is no public sign-up — the `/auth` page is sign-in only. Reaching authenticated routes (Dashboard, etc.) end-to-end requires an email seeded into `allowed_users` plus an active `org_members` row; no such test account is provisioned in this environment. The sign-in form still exercises the live Supabase auth backend (invalid credentials return an "Invalid login credentials" toast), which is enough to verify the frontend↔backend integration.
- **AI, email, Google Calendar, and edge-function flows** depend on server-side secrets (`LOVABLE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CALENDAR_API_KEY`) that live only in Supabase, not the repo. Those features are unavailable locally without those secrets.
