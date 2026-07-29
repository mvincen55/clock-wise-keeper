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
| Durable memory about the **office** (people, policies, preferences) and the **site** (build decisions, todos, how the app works) | managers | `save_memory` / `forget_memory` → new `assistant_memories` table; loaded into every future chat |
| Read the app's own source code | managers | `github_list_files`, `github_read_file` against this repo |
| Write code and push it | managers | `github_commit_files` (atomic multi-file commit) straight to `main`, or to a feature branch + `github_open_pr` for review |

## One-time setup (secrets)

Add these as **edge function secrets** (in Lovable: your project → Cloud →
Secrets; or the Supabase dashboard → Edge Functions → Secrets):

| Secret | Required | Value |
|---|---|---|
| `OPENROUTER_API_KEY` | yes | Create at [openrouter.ai/keys](https://openrouter.ai/settings/keys) and add credits. Without it both chat surfaces return a friendly "not configured" error. |
| `OPENROUTER_MODEL` | no | Defaults to `moonshotai/kimi-k3`. Any OpenRouter model slug with tool-calling works, so the model can be swapped without a code change (e.g. `moonshotai/kimi-k2.7-code` for cheaper build-heavy sessions). |
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

The previous `fof-assistant` and `ask-docs` functions are left in place
untouched as a rollback path; the UI no longer calls them.
