# Genericization Pass — Phase 0 Inventory

**Audit only — no code was changed.** Every hardcoded office-specific value found in the
tree (src, supabase functions, migrations, seeds, edge-function prompts), with file/line
and a proposed destination. Line numbers are as of commit `a9b5da8`.

**Destination legend**

| Destination | Meaning |
|---|---|
| **Branding** | Phase 1 `org_branding` (or extended `orgs`): identity shown on documents/emails |
| **Setting** | Phase 2a `fof_settings`-style org-scoped value with type + validation bounds |
| **Rule** | Phase 2b named discount/policy rule row (`discount_rules` or equivalent) |
| **Seed default** | Stays in code as the shipped default a new org is seeded with (Harelick's proven values), org rows override |
| **Product** | Product behavior / platform identity — stays in code, not office-specific |
| **Out of scope** | Noted for completeness; explicitly deferred by the brief (deposit-log layout etc.) |

Risk tier: 💰 = changes dollar output (server-side validation with bounds required),
🖨 = changes printed text/pixels only.

---

## 1. Identity & branding

| # | File:line | Value | Destination |
|---|---|---|---|
| 1.1 | `src/lib/fof/defaults.ts:10-15` | `DEFAULT_PRACTICE_INFO`: "Harelick Dental Associates, LLC", 278 Alden Road, Fairhaven MA 02719, (508) 993-0515, drharelick.com, "Dr. Scott" | **Branding** (name/address/phone/website) + **Seed default**. Doctor default → org setting (see 5.2) |
| 1.2 | `src/lib/fof/defaults.ts:31` (`DEFAULT_CONTACT_NOTE`) | Contact footnote embeds phone + full mailing address ("Call us at (508) 993-0515 … mail your signed copy … 278 Alden Road…") | **Branding**: template default text; regenerate from org_branding fields at seed time (template rows already per-org — Harelick's existing rows are untouched, preserving the invariant) |
| 1.3 | `supabase/migrations/20260722150000_fof_templates.sql:8-11` | `fof_settings` column DEFAULTs: 'Harelick Dental Associates, LLC', '278 Alden Road', 'Fairhaven, MA 02719', '(508) 993-0515' | **Branding**: `fof_settings` practice-identity columns migrate to `org_branding`; new-org defaults become empty/placeholder (identity is never a "default"), Harelick seeded as rows |
| 1.4 | `supabase/migrations/20260722210000_fof_settings_website.sql:2` | `website` DEFAULT 'drharelick.com' | **Branding** (same as 1.3) |
| 1.5 | `src/assets/harelick-logo.png` | The logo asset itself, bundled into the build | **Branding**: org-scoped Supabase storage bucket + upload UI; asset becomes Harelick's stored file |
| 1.6 | `src/components/fof/FofPrintSheet.tsx:10,238` | `import logoUrl from '@/assets/harelick-logo.png'`; `<img src={logoUrl} alt={practice.practiceName}>` | **Branding**: read logo URL from org_branding |
| 1.7 | `src/components/DepositPrintSheet.tsx:2,111` | Same logo import; `alt="Harelick Dental Associates"` (alt is a literal, not from props) | **Branding** |
| 1.8 | `src/components/DepositPrintSheet.tsx:184` | Print footer literal: "Harelick Dental Associates, LLC · Daily Deposit Log · …" | **Branding**: footer text from org_branding (deposit sheet takes no practice props today — needs them) |
| 1.9 | `src/index.css:164` (`--dep-navy`) and `:400-404` (`--fof-navy`, `--fof-tint`) | `#53406e` "office deep purple", `#f3f0f8` "office light purple" (plus derived `--dep/fof-ink/muted/line` shades) | **Branding**: brand color in org_branding, injected as CSS custom property at render; Harelick seeded `#53406e`. Derived shades: compute or store alongside |
| 1.10 | `src/pages/PTO.tsx:115,495` | "Harelick Dental — Combined PTO Bank", "Harelick Dental Accrual Tiers" headings | **Branding** (display-name interpolation) |
| 1.11 | `src/hooks/usePtoEngine.ts:6-13` | Header comment "Harelick Dental PTO Policy" + `PTO_TIERS` accrual rates/caps (0.0576/2.30 … 0.1009/4.00) | **Setting** 💰 (payroll-adjacent): tiers are Harelick's PTO policy, hardcoded for all users. Candidate org-scoped `pto_accrual_tiers`; larger than this pass's FOF focus — flag for a decision (could be deferred like deposit layout, but it IS an office-specific money value) |
| 1.12 | `src/hooks/useAuth.tsx:5` | `ALLOWED_EMAILS = ['meganvincent43@gmail.com', 'mvincent@drharelick.com']` client-side gate | **Seed/legacy**: predates orgs; personal + office emails in code. Should be retired in favor of `allowed_users` table / org membership (already exists). Flag for review — auth change, not print-path |
| 1.13 | `supabase/migrations/20260217234928…​.sql:20`, `20260610173334…​.sql:1` | `allowed_users` seeds: meganvincent43@gmail.com, mvincent@drharelick.com | **Seed default** (already rows — fine); note only that migrations carry personal emails |
| 1.14 | `supabase/functions/google-calendar-events/index.ts:3-4` | `OFFICE_CALENDAR_ID = 'c_ec5a…@group.calendar.google.com'` ("HDA - Fairhaven office calendar") | **Setting** 🖨: org-scoped calendar ID (function already accepts `?calendarId=` — the hardcode is only the fallback). Companion comment `src/pages/OfficeCalendar.tsx:155` |
| 1.15 | `supabase/functions/auth-email-hook/index.ts:47-50` | `SITE_NAME "clock-wise-keeper"`, sender domains `timekeepers.me` / `notify.timekeepers.me` | **Product**: platform email identity (Lovable-scaffolded), not office identity. If org-branded auth emails are wanted later, sender *display name* could read from org_branding — not required by this pass |
| 1.16 | `src/test/doc-format.test.ts:7-9,37` | "Harelick Dental Associates, LLC Fairhaven, MA" as test fixtures | **Product** (test data): rename to a neutral fixture practice during Phase 1 cleanup (no runtime effect) |
| 1.17 | `src/components/AppLayout.tsx:27` + `useAuth.tsx:7` | "TimeVault" brand / `timevault_session_timeout_minutes` storage key | **Product**: app brand, not office-specific. No action |

## 2. Physical procedure text (printed instructions)

| # | File:line | Value | Destination |
|---|---|---|---|
| 2.1 | `src/components/DepositPrintSheet.tsx:145` | "Purple envelope — no tape" callout (printed on both copies) | **Setting** 🖨: addressable free-text slot (per copy, per position), snapshotted onto the saved deposit record at save time; Harelick default = current text |
| 2.2 | `src/components/DepositPrintSheet.tsx:17-18` | `BANK_COPY_ACCOUNT = 'Bay Coast Account #841845805'` — real bank + account number in source | **Setting** 🖨 (and a mild security smell — an account number in a public repo): org-scoped deposit settings; snapshot onto saved records |
| 2.3 | `src/components/DepositPrintSheet.tsx:136-137,165` | Bank names in labels: "BC Bank — cash & checks", "F Bank — card deposits", "BC Bank Total" | **Setting** 🖨: bank display names as org settings. (Bank *count/split structure* is Out of scope — future build; only the names move now) |
| 2.4 | `src/components/DepositPrintSheet.tsx:185` | "Office Copy — file with the day sheet" filing instruction | **Setting** 🖨 (addressable note slot) or Seed default — low priority, review |

## 3. Money constants 💰

All get `fof_settings`-style org rows with type + server-validated bounds; shipped default = current Harelick value.

| # | File:line | Value | Destination |
|---|---|---|---|
| 3.1 | `src/lib/fof/visits.ts:19` | `DAY_OF_SERVICE_THRESHOLD_CENTS = 100_000` ($1,000) | **Setting** 💰 (2a): bounds $0–$5,000 per brief |
| 3.2 | `src/lib/fof/visits.ts:26` | `MIN_STANDALONE_PAYMENT_CENTS = 10_000` ($100) | **Setting** 💰 (2a) |
| 3.3 | `src/lib/fof/discounts.ts:23-28` | `SENIOR_RULES`: threshold $1,000, senior 10%, under-65 prepay 5%, membership extra 5% | **Rule** 💰 (2b): named "senior 65+" + "membership" rules with enabled flag, value, application mode. Threshold shared with 3.1 or its own bounded setting |
| 3.4 | `src/lib/fof/cdt.ts:16-18,25` | `NEVER_COVERED_CODES = {4265, 4268, 5982, 7953}` | **Rule** 💰 (2b): org-scoped code list seeded with these four |
| 3.5 | `src/pages/FofBuilder.tsx:110-115` | `DOWNGRADE_MAP` D2391→D2140 … D2394→D2161 (posterior composite → amalgam) | **Product** (CDT-standard alternate-benefit mapping) — keep in code. The *default-off* behavior is already per-line/per-plan; confirm downgrade default stays a 2a setting ("downgrade default: off") |
| 3.6 | `src/pages/FofBuilder.tsx:136` | `NO_PREPAY_CODES = {'D5982'}` (surgical guide billed at visit, never prepaid) | **Rule** 💰 (2b): org-scoped list, seeded D5982 |
| 3.7 | `src/pages/FofBuilder.tsx:148-153` | `ILLUMITRAC_INCLUDED` — 15 CDT codes the membership covers at no charge (per office Policy Handbook / 2025 flyer) | **Rule** 💰 (2b): membership-inclusion list attached to the membership rule/template, seeded with these codes. (The fof-assistant prompt already tells staff "the app's developer" owns this — after 2b it becomes org config) |
| 3.8 | `src/lib/fof/defaults.ts:52-130` | Template seeds: discount 10%, membership 10%, per-template senior flags, "Illumitrac" naming | **Seed default**: templates are already org rows; seeds stay as shipped defaults but percent values should *reference* 2b rules per the brief ("templates reference rules; they do not contain them"). "Illumitrac" name → the org's membership-plan display name (setting) |
| 3.9 | `supabase/migrations/20260722150000_fof_templates.sql:22-23,28-30` | Column defaults: discount 10.00, label 'Office Discount (Prepay discount)', installment labels JSON | **Seed default** (already per-org rows) |

## 4. Structural assumptions

| # | File:line | Value | Destination |
|---|---|---|---|
| 4.1 | `src/components/DepositPrintSheet.tsx:14-15` | `CHECK_LINES = 46`, `LEFT_LINES = 23` (two columns) | **Out of scope** (deposit layout configurability — future build). Inventory only |
| 4.2 | `src/components/DepositPrintSheet.tsx:104-106,133-144,156-163` | Two-bank split (cash+checks vs cards), card/financing breakdown rows (Ins CC / Pt CC / Illumitrac / Outside Financing) | **Out of scope** (structure). But the row *labels* "Illumitrac" / "Outside Financing" are office vocabulary → **Setting** 🖨 when 2c lands |
| 4.3 | `supabase/migrations/20260723210000_deposit_log.sql:13` + `useDepositLog.ts` / `DepositLog.tsx` | `illumitrac_cents` column name bakes the membership brand into the schema | **Out of scope** (schema rename churn not worth it); note for the future deposit build: label from settings, column stays generic-enough |
| 4.4 | `src/components/fof/FofPrintSheet.tsx:292` | "Included with Illumitrac Membership" printed line | **Setting** 🖨: derive from membership plan display name (same setting as 3.8) |
| 4.5 | `src/pages/FofBuilder.tsx:1056` | Footnote "Included at no charge with your Illumitrac membership: …" | **Setting** 🖨 (same) |

## 5. Naming / seeds

| # | File:line | Value | Destination |
|---|---|---|---|
| 5.1 | `src/hooks/useFeeSchedules.ts:113` + `src/pages/FofFees.tsx:376` | Auto-seeded schedule named 'Office Fee Schedule' (kind 'office') | **Seed default** — generic enough; keep. Display could read "…the office schedule" generically |
| 5.2 | `src/pages/FofBuilder.tsx:139` | `FOF_DOCTORS = ['Dr. Scott', 'Dr. Jennie', 'Dr. Robert', 'Dr. Nicole', 'Dr. Natalie']` dropdown | **Setting** 🖨: org-scoped doctor list (new small table or settings array); Harelick seeded with these five |
| 5.3 | `supabase/migrations/20260723034500_fof_doctor_name.sql:4` | `fof_templates.doctor_name` DEFAULT 'Dr. Scott' | **Seed default** → change column default to '' once org doctor list exists; Harelick rows keep their value |
| 5.4 | `supabase/migrations/20260724220000_important_numbers_tabs.sql:37-43,50-57` | Tab seeds (Office/Team/Referrals/Labs/Insurance Companies/Other) + section→tab mapping (Doctor Phones, Oral Surgery, …) | **Seed default** — already per-org rows, manager-renamable. Generic; keep |
| 5.5 | `src/lib/checklist-defaults.ts:24-168` | Factory checklists transcribed from Harelick's Drive sheets — office-specific vocabulary throughout: Dentrix, RM, HCF/HCU, PB, QB, Keurig, "Move Documents to Attic", "Numbers in Breakroom", Vac-U-Sol, IOS laptop… | **Seed default** (already seeded-then-editable rows). Review call: ship as-is ("~80% right" argument is weak here — many items are Harelick-house-specific) vs. trim to a generic dental core. **Recommend human decision** |
| 5.6 | `src/pages/MorningHuddle.tsx:10-48` | Huddle agenda mirroring the office's "Morning Huddle Info" doc (stores nothing) | **Seed default**: generic dental content; fine to ship as the default agenda. Future: org-editable rows (new feature — out of scope) |
| 5.7 | `src/lib/fof/defaults.ts:98,109` | Template name "In-House Membership (Illumitrac)" + Illumitrac footnote | **Seed default** (org rows) + membership display name setting (3.8) |

## 6. Prompt-embedded rules (edge functions)

Per the brief: **office voice** → migrate to `fof_ai_guidance` / settings; **product behavior** → stays in code.

### `fof-assistant/index.ts`

| # | Line | Value | Classification |
|---|---|---|---|
| 6.1 | 96-97 | `POLICY_SUMMARY` — one paragraph mixing both kinds: prepay 10% (+5% Illumitrac senior), $1,000 day-of-service rule, half-ahead/final-visit-split collection policy, work-up/surgical-guide never prepaid, downgrades off by default ("plans like Altus"), "Delivery" vocabulary, fillings-never-show-surfaces, the four never-covered codes | **Split.** Money/policy facts (10%, $1,000, never-covered codes, downgrade default) → generate this block from the Phase 2 settings registry so the assistant explains *live org values*, never stale prose. Wording rules ("Delivery" not "seating", no surfaces) → **office voice**, migrate to seeded `fof_ai_guidance` rows. Collection-shape facts (half-ahead etc.) are **product behavior** — stay, reworded genericly |
| 6.2 | 65 | Search-query prompt: "insurance manuals like Delta Dental", "DD MA -> Delta Dental" | **Office voice** (the office's carrier mix): make carrier examples org-configurable or drop the named example. Low risk |
| 6.3 | 221 | Capability honesty text ("point them … to the app's developer for membership-inclusion rules") | **Product behavior** — becomes contract-driven from the Phase 3 settings registry (membership inclusions become assistant-explainable org config after 2b) |

### `name-visits/index.ts`

| # | Line | Value | Classification |
|---|---|---|---|
| 6.4 | 142 | "The office's word for receiving any finished lab-made piece is ALWAYS 'Delivery' … NEVER 'seating', 'seat', 'insertion', 'placement', or 'cementation'"; surgical guide never "delivered" | **Office voice** → seed as `fof_ai_guidance` rows (the mechanism already exists and both functions already load guidance at lines 70-92). Keep a generic naming-quality instruction in code |
| 6.5 | 146 | "For fillings, never mention surfaces or surface counts" | **Office voice** → `fof_ai_guidance` seed |
| 6.6 | 142-149 | Everything else: timing-first names, unique names, no invented visits, tooth-number rules, no-promises/banned-words list, active voice, denture arch wording, 420-char cap | **Product behavior** — stays in code |

### `ask-docs/index.ts`

| # | Line | Value | Classification |
|---|---|---|---|
| 6.7 | 64-68 | "insurance manuals (e.g. Delta Dental …)", "DD MA → Delta Dental" | **Office voice** (same as 6.2) |
| 6.8 | 227-245 | Office-assistant system prompt | **Product behavior** — generic; no office literals found |

---

## Invariant reference records (to capture before Phase 1)

Per the brief, before any edit: print-DOM snapshots of (a) a saved FOF — patient + office copy —
covering insurance estimate, a downgrade line (`DOWNGRADE_NOTE`, FofBuilder.tsx:119), payment
schedule with an under-$1k first visit, a never-covered code, the "You save" chip
(FofPrintSheet.tsx:373), and the benefit-year renewal note (`RENEWAL_NOTE`, FofBuilder.tsx:131);
and (b) a saved Deposit Log, Office + Bank copies. These land as snapshot tests in the Phase 1 PR.

## Summary counts

- **Branding (Phase 1):** 11 items (1.1–1.10, 1.14 partially)
- **Settings 2a (money thresholds):** 3.1, 3.2 (+ downgrade default confirmation 3.5)
- **Rules 2b:** 3.3, 3.4, 3.6, 3.7 (+ template percent refs 3.8)
- **Settings 2c / printed-text slots:** 2.1–2.4, 4.4, 4.5, 5.2
- **Prompt migrations (with Phase 2/3):** 6.1, 6.2, 6.4, 6.5, 6.7
- **Human decisions requested:** 1.11 (PTO tiers in/out of scope), 1.12 (retire client email allowlist), 5.5 (checklist seeds as-is vs trimmed), 2.2 (account number in repo history)
- **Out of scope confirmed:** deposit layout/bank-count structure (4.1–4.3)
