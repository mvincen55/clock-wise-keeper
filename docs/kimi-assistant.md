# Kimi office assistant (FOF Assistant + Ask AI)

Both chat surfaces in the app — the floating **FOF Assistant** widget in the FOF
builder and the **Ask AI** page — run on one backend: the `kimi-agent` edge
function, which talks to **Moonshot Kimi K3 through OpenRouter** and can use
tools, not just answer.

What it can do, by role:

| Capability | Who | How |
|---|---|---|
| Answer questions, search office documents (policies, HR, insurance manuals) | everyone | `search_office_docs` over the existing knowledge base; answers cite sources |
| FOF wording training ("never say X, say Y" → standing rule) | managers, in the FOF widget with Training on | `save_wording_rule` → `fof_ai_guidance` (same table and behavior as before) |
| Durable memory about the **office** (people, policies, preferences) and the **site** (build decisions, todos, how the app works) | managers | `save_memory` / `forget_memory` → `assistant_memories`; loaded into every future chat |
| File knowledge about a **procedure code** onto that code's fee-schedule row | managers | `save_code_note` → `fee_schedule_items.notes` (see "Where knowledge goes") |
| Read the app's own source code | managers | `github_list_files`, `github_read_file` against this repo |
| Write code and push it | managers | `github_commit_files` (atomic multi-file commit) straight to `main`, or to a feature branch + `github_open_pr` for review |

## Where knowledge goes

Three homes, and putting a fact in the right one is what makes it show up
at the right moment:

| The knowledge | Home | When the assistant uses it |
|---|---|---|
| About a code, true for everyone — how the office words it, what it includes, sequencing, lab/delivery policy | **Office** fee schedule note | **Every patient**, whatever insurance they carry |
| About a code, for one insurer — downgrades, narrative/x-ray requirements, frequency limits, that plan's quirks | That **carrier's** fee schedule note | **Only** when billing that code to that insurance |
| Office-wide policy that isn't code-specific | `save_memory` | Every conversation |
| Long formal documents (handbooks, carrier manuals) | Ask AI → Documents | Retrieved when relevant, with citations |

Both kinds of code note are legitimate — a Delta Dental downgrade rule
*should* live on Delta Dental, and it should not be applied to a BCBS
patient. What the auditor watches for is a note in the **wrong** home:
general guidance stranded on one carrier (invisible to everyone else), or
an insurer's rule sitting on the office schedule (wrongly applied to all).

Managers can see every code note at any time from the **book icon** in the
FOF Assistant header — grouped into "applies to every patient" and
"insurance-specific."

## Contradictions are never applied silently

If the office tells the assistant something that contradicts what it was
already told, it does **not** overwrite the old fact and does not pick a
winner. The new fact is stored `pending`, kept out of **every** prompt,
and the assistant states both versions and asks the owner or manager which
is right. Decide it in chat, or on **Ask AI → Memory & Audit**, which
badges the count waiting on you.

Every save is checked twice: the main model is instructed to watch for
clashes, and — because a model that has just been persuaded of something
is a poor judge of whether it contradicts what it knew — a separate,
cheaper model independently re-checks each write. That check **fails
open**: if it errors, the save proceeds normally rather than blocking the
office from teaching the assistant.

## The auditor

`assistant-auditor` is a second AI that never talks to staff. It only
checks that what the office has taught is consistent and correctly filed,
and writes findings for a manager to review:

- **memory_contradiction** — two active facts that can't both be true (catches pairs that drifted apart over time, or predate the gate above)
- **note_misfiled** — a code note in the wrong home, per the table above
- **code_fact_in_memory** — code knowledge kept as chat memory when it belongs on the code's fee row

Findings are fingerprinted, so re-running never re-reports something
already open or already dismissed. It proposes fixes rather than applying
them: only "move general guidance to the office schedule" offers one-click
apply, because that destination is unambiguous. Moving the other way needs
a human to say *which* insurance, so it stays a manual edit on Fee
Schedules.

Run it with the **Run audit** button on Memory & Audit. To have it run on
its own overnight, add a scheduled job hitting the `assistant-auditor`
function — nothing schedules it automatically today.

## One-time setup (secrets)

Add these as **edge function secrets** (in Lovable: your project → Cloud →
Secrets; or the Supabase dashboard → Edge Functions → Secrets):

| Secret | Required | Value |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | Create at [openrouter.ai/keys](https://openrouter.ai/settings/keys) and add credits. Without it both chat surfaces return a friendly "not configured" error. |
| `OPENROUTER_MODEL` | no | Defaults to `moonshotai/kimi-k3`. Any OpenRouter model slug with tool-calling works, so the model can be swapped without a code change (e.g. `moonshotai/kimi-k2.7-code` for cheaper build-heavy sessions). |
| `OPENROUTER_CHECK_MODEL` | no | Model for contradiction checking and the auditor — small, strict classification work. Defaults to `moonshotai/kimi-k2.6`. |
| `GITHUB_TOKEN` | for build powers | GitHub → Settings → Developer settings → **Fine-grained personal access token**, scoped to **only** `mvincen55/clock-wise-keeper`, with repository permissions **Contents: Read and write** and **Pull requests: Read and write**. Without it, Kimi answers and remembers but honestly reports that build tools aren't configured. |
| `GITHUB_REPO` | no | Defaults to `mvincen55/clock-wise-keeper`. |
| `GITHUB_BRANCH` | no | The Lovable-synced branch; defaults to `main`. |

Also run the new migration against the live database (this repo mirrors schema
changes; they don't apply themselves):
`supabase/migrations/20260727120000_assistant_memories.sql` — easiest is to
paste it into the Lovable database view's SQL runner, or ask Lovable to run it.

## How "build as we go" flows to Lovable and the live site

- The Lovable project (**Time Keeper**, project `1fc9eedc-91d9-4d4f-a24d-aba0b1c277e1`)
  two-way syncs with this GitHub repo. When Kimi commits to `main`, **Lovable
  pulls the change automatically** and the app/preview updates — that push *is*
  how the in-app assistant "talks to Lovable."
- The **published** site ([clock-wise-keeper.lovable.app](https://clock-wise-keeper.lovable.app))
  updates when a human clicks **Publish** in Lovable. Lovable's MCP/API is
  OAuth-only for approved clients (ChatGPT/Claude/Cursor), so a backend
  function cannot press Publish or drive Lovable's own agent; Kimi is
  instructed to say so and to hand you a ready-to-paste **"Prompt for
  Lovable:"** when a task fits Lovable's agent better (big redesigns, backend
  wiring in Lovable Cloud).
- Every push triggers CI on GitHub (tests + build). Kimi can't run tests
  itself and is instructed to say that; for risky areas (payroll/time math,
  RLS, migrations) it's told to prefer a branch + PR so CI and a human gate
  the change.

## Guardrails

- **Roles are enforced server-side**: build/memory/training tools aren't even
  offered to non-managers, the executors re-check the role, and the database
  RLS policies (`assistant_memories`, `fof_ai_guidance`) enforce admin-write a
  third time under the caller's JWT.
- **Attribution**: every assistant-driven commit gets a
  `Pushed-via: TimeVault kimi-agent for <email>` trailer, so the git history
  shows who asked for what — this repo is a payroll system of record.
- **HIPAA boundary is unchanged**: no patient identity ever goes to the AI
  (OpenRouter has no BAA, same as the previous gateway). Chat is bounded and
  never stored; the FOF widget still sends only code-derived procedure
  wording; prompts forbid patient details in memories, rules, code, and
  commit messages, and staff-facing copy repeats the rule.
- **Bounded everything**: message count/length, doc excerpts, memory size,
  file sizes (64k chars/file, 10 files/commit), tool rounds (6), and a soft
  100s deadline so the function finalizes before the edge wall clock.

The previous `fof-assistant` function has been retired and deleted (nothing
called it, and its prompt recited stale hardcoded office numbers). `ask-docs`
is left in place and still used for corpus Q&A.
