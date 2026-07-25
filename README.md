# Financial Options Form — Standalone (Frozen)

A standalone copy of the Financial Options Form builder for Harelick
Dental Associates: templates, fee schedules, insurance estimation,
payment schedules, and the printed patient + office copies.

**This application is frozen.** It was extracted from the source system
at commit `a9b5da8` (pre-refactor), stripped of everything except the
FOF, and is intentionally not updated:

- **No AI anywhere.** The AI payment-naming, AI treatment summaries,
  the FOF assistant, and the screenshot import were removed entirely.
  The treatment description and payment names are plain text you type
  and edit. Fee schedules import from XLSX/CSV or manual entry.
- **No shared infrastructure.** It runs on its own Supabase project and
  its own static hosting, under the practice's own accounts. There are
  no external services, API keys, or dependencies beyond Supabase.
- **One intentional post-freeze fix** was carried in: sign-in access is
  controlled by the `allowed_users` table in the database (add a row +
  create the user in Supabase) instead of an email list in the code, so
  staff can be added without touching this repository.

See `RUNBOOK.md` for setup, deployment, and the two admin tasks
(adding a user, waking a paused free-tier project).

## Development

```sh
npm install
cp .env.example .env   # fill in the Supabase URL + anon key
npm run dev            # local dev server
npm test               # unit tests (118)
npm run build          # production bundle in dist/
```
