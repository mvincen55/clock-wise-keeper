// Kimi office agent: one AI backend for both chat surfaces — the FOF
// Assistant widget (mode "fof") and the Ask AI page (mode "ask").
// Runs Moonshot Kimi K3 through OpenRouter with native tool calling.
//
// What it can DO (tool calls, role-gated server-side):
//   everyone   search_office_docs — FTS over the org's uploaded documents
//   managers   save_memory / forget_memory — durable org memory ("remember
//              as we go") about the office and about this site/app
//   managers   save_wording_rule — FOF "train as we go" (mode "fof" only,
//              honors the widget's training toggle)
//   managers   github_list_files / github_read_file / github_commit_files /
//              github_open_pr — read and change this app's own source on
//              GitHub. Pushes to the default branch sync into Lovable
//              automatically (that is the machine channel to Lovable);
//              publishing the production site stays a human click in
//              Lovable, and the prompt tells the model to be honest there.
//
// HIPAA note: unchanged from fof-assistant/ask-docs — the AI must NEVER
// see a patient's identity. Chat is bounded and never stored; the only
// writes are explicit, de-identified artifacts (memories, wording rules,
// code commits) created under the caller's JWT so RLS enforces org and
// role again in the database.
//
// Secrets (Supabase edge function secrets):
//   OPENROUTER_API_KEY  required — chat runs through OpenRouter
//   OPENROUTER_MODEL    optional — defaults to moonshotai/kimi-k3
//   GITHUB_TOKEN        optional — fine-grained PAT (Contents RW, Pull
//                       requests RW on the repo); without it the build
//                       tools report "not configured" instead of failing
//   GITHUB_REPO         optional — owner/name, default mvincen55/clock-wise-keeper
//   GITHUB_BRANCH       optional — Lovable-synced branch, default main

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadProcedureNotes } from "../_shared/procedure-notes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "moonshotai/kimi-k3";
const GITHUB_API = "https://api.github.com";

const MAX_MESSAGES = 16;
const MAX_MESSAGE_CHARS = 4000;
const MAX_VISITS = 12;
const MAX_PROCEDURES_PER_VISIT = 12;
const MAX_LABEL_CHARS = 80;
const MAX_TREATMENT_CHARS = 500;
const MAX_TOOL_ROUNDS = 6;
// Finalize before the edge-function wall clock (150s on the base plan).
const SOFT_DEADLINE_MS = 100_000;
const MAX_MEMORY_CHARS = 500;
const MAX_MEMORIES_IN_PROMPT = 120;
const MAX_DOC_CONTEXT_CHARS = 24_000;
const MAX_COMMIT_FILES = 10;
const MAX_FILE_CHARS = 64_000;
const MAX_READ_CHARS = 48_000;

const bounded = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

/** Multi-line variant for code and memory content: trims + caps only. */
const boundedText = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.trim().slice(0, cap) : "";

interface DocMatch {
  doc_id: string;
  title: string;
  category: string;
  chunk_index: number;
  content: string;
  rank: number;
}

interface AgentAction {
  type: string;
  summary: string;
  url?: string;
}

interface AgentSource {
  id: string;
  title: string;
  category: string;
}

// ---------------------------------------------------------------------------
// Office document retrieval (same FTS + neighbor-chunk approach as ask-docs)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function searchOfficeDocs(
  supabase: any,
  queries: string[],
  sources: Map<string, AgentSource>
): Promise<string> {
  const cleaned = queries
    .map((q) => bounded(q, 60))
    .filter(Boolean)
    .slice(0, 5);
  if (cleaned.length === 0) return "ERROR: provide 1-5 short keyword queries.";

  const results = await Promise.all(
    cleaned.map((q) => supabase.rpc("search_office_doc_chunks", { p_query: q, p_limit: 8 }))
  );
  const byKey = new Map<string, DocMatch>();
  for (const result of results) {
    for (const match of (result.data ?? []) as DocMatch[]) {
      const key = `${match.doc_id}:${match.chunk_index}`;
      const existing = byKey.get(key);
      if (!existing || match.rank > existing.rank) byKey.set(key, match);
    }
  }
  const matches = [...byKey.values()].sort((a, b) => b.rank - a.rank).slice(0, 14);
  if (matches.length === 0) {
    return "No document sections matched those queries. Try different keywords, or the answer may not be in the knowledge base.";
  }

  // Pull neighboring chunks for the strongest hits so rules that span a
  // chunk boundary arrive intact.
  const docMeta = new Map<string, { title: string; category: string }>();
  const wanted = new Map<string, Set<number>>();
  for (const match of matches.slice(0, 5)) {
    docMeta.set(match.doc_id, { title: match.title, category: match.category });
    const set = wanted.get(match.doc_id) ?? new Set<number>();
    if (match.chunk_index > 0) set.add(match.chunk_index - 1);
    set.add(match.chunk_index + 1);
    wanted.set(match.doc_id, set);
  }
  for (const match of matches) wanted.get(match.doc_id)?.delete(match.chunk_index);
  const neighborResults = await Promise.all(
    [...wanted.entries()]
      .filter(([, set]) => set.size > 0)
      .map(([docId, set]) =>
        supabase
          .from("office_doc_chunks")
          .select("doc_id, chunk_index, content")
          .eq("doc_id", docId)
          .in("chunk_index", [...set])
      )
  );
  for (const result of neighborResults) {
    for (const chunk of result.data ?? []) {
      const meta = docMeta.get(chunk.doc_id);
      if (!meta) continue;
      matches.push({
        doc_id: chunk.doc_id,
        title: meta.title,
        category: meta.category,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        rank: 0,
      });
    }
  }

  let budget = MAX_DOC_CONTEXT_CHARS;
  const kept: DocMatch[] = [];
  for (const match of [...matches].sort((a, b) => b.rank - a.rank)) {
    if (match.content.length > budget) continue;
    budget -= match.content.length;
    kept.push(match);
  }
  kept.sort((a, b) => a.title.localeCompare(b.title) || a.chunk_index - b.chunk_index);
  for (const m of kept) {
    if (!sources.has(m.doc_id)) {
      sources.set(m.doc_id, { id: m.doc_id, title: m.title, category: m.category });
    }
  }
  return kept
    .map((m) => `[${m.title} — section ${m.chunk_index}] (${m.category})\n${m.content}`)
    .join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// GitHub tools (Git Data API — atomic multi-file commits)
// ---------------------------------------------------------------------------

interface GithubConfig {
  token: string;
  repo: string;
  branch: string;
}

function githubConfig(): GithubConfig | null {
  const token = Deno.env.get("GITHUB_TOKEN");
  if (!token) return null;
  return {
    token,
    repo: Deno.env.get("GITHUB_REPO") ?? "mvincen55/clock-wise-keeper",
    branch: Deno.env.get("GITHUB_BRANCH") ?? "main",
  };
}

async function ghFetch(
  gh: GithubConfig,
  path: string,
  init?: { method?: string; body?: unknown }
  // deno-lint-ignore no-explicit-any
): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${gh.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* some responses have no body */
  }
  return { ok: response.ok, status: response.status, data };
}

const NOT_CONFIGURED =
  "ERROR: GitHub is not configured. A manager must add the GITHUB_TOKEN secret (fine-grained PAT with Contents read/write and Pull requests read/write on the repo) in the backend secrets. Until then you can only read nothing and change nothing on GitHub — tell the user exactly that.";

/** Repo-relative path guard — no traversal, no absolute paths, no .git. */
function safeRepoPath(raw: unknown): string | null {
  const path = typeof raw === "string" ? raw.trim().replace(/^\.\//, "") : "";
  if (!path || path.length > 300) return null;
  if (path.startsWith("/") || path.includes("..") || path.startsWith(".git/") || path === ".git") {
    return null;
  }
  return path;
}

async function githubListFiles(gh: GithubConfig, prefix: string): Promise<string> {
  const branch = await ghFetch(gh, `/repos/${gh.repo}/branches/${gh.branch}`);
  if (!branch.ok) return `ERROR: could not read branch ${gh.branch}: ${branch.data?.message ?? branch.status}`;
  const treeSha = branch.data?.commit?.commit?.tree?.sha;
  const tree = await ghFetch(gh, `/repos/${gh.repo}/git/trees/${treeSha}?recursive=1`);
  if (!tree.ok) return `ERROR: could not read file tree: ${tree.data?.message ?? tree.status}`;
  const entries = ((tree.data?.tree ?? []) as { path: string; type: string; size?: number }[])
    .filter((e) => e.type === "blob" && (!prefix || e.path.startsWith(prefix)))
    .slice(0, 500)
    .map((e) => `${e.path}${typeof e.size === "number" ? ` (${e.size} bytes)` : ""}`);
  if (entries.length === 0) return `No files under "${prefix}".`;
  const truncated = tree.data?.truncated ? "\n(tree truncated by GitHub)" : "";
  return `Files on ${gh.branch}${prefix ? ` under ${prefix}` : ""} (${entries.length} shown):\n${entries.join("\n")}${truncated}`;
}

async function githubReadFile(gh: GithubConfig, path: string): Promise<string> {
  const res = await ghFetch(
    gh,
    `/repos/${gh.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${gh.branch}`
  );
  if (!res.ok) return `ERROR: could not read ${path}: ${res.data?.message ?? res.status}`;
  if (res.data?.type !== "file" || typeof res.data?.content !== "string") {
    return `ERROR: ${path} is not a readable file (is it a directory?).`;
  }
  let text: string;
  try {
    const bytes = Uint8Array.from(atob(res.data.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return `ERROR: ${path} is not a UTF-8 text file.`;
  }
  const clipped = text.length > MAX_READ_CHARS;
  return `// ${path} @ ${gh.branch}${clipped ? " (first " + MAX_READ_CHARS + " chars)" : ""}\n${text.slice(0, MAX_READ_CHARS)}`;
}

interface CommitFilesInput {
  message: string;
  files: { path: string; content: string }[];
  deletePaths: string[];
  branch: string;
}

async function githubCommitFiles(
  gh: GithubConfig,
  input: CommitFilesInput,
  userEmail: string,
  actions: AgentAction[]
): Promise<string> {
  const branch = input.branch || gh.branch;

  // Base commit for the target branch — create the branch from the default
  // branch head when it doesn't exist yet.
  let head = await ghFetch(gh, `/repos/${gh.repo}/git/ref/heads/${branch}`);
  if (!head.ok && head.status === 404 && branch !== gh.branch) {
    const base = await ghFetch(gh, `/repos/${gh.repo}/git/ref/heads/${gh.branch}`);
    if (!base.ok) return `ERROR: could not read base branch ${gh.branch}: ${base.data?.message ?? base.status}`;
    const created = await ghFetch(gh, `/repos/${gh.repo}/git/refs`, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: base.data?.object?.sha },
    });
    if (!created.ok) return `ERROR: could not create branch ${branch}: ${created.data?.message ?? created.status}`;
    head = await ghFetch(gh, `/repos/${gh.repo}/git/ref/heads/${branch}`);
  }
  if (!head.ok) return `ERROR: could not read branch ${branch}: ${head.data?.message ?? head.status}`;
  const baseSha = head.data?.object?.sha as string;

  const baseCommit = await ghFetch(gh, `/repos/${gh.repo}/git/commits/${baseSha}`);
  if (!baseCommit.ok) return `ERROR: could not read base commit: ${baseCommit.data?.message ?? baseCommit.status}`;

  const treeEntries = [
    ...input.files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    ...input.deletePaths.map((p) => ({ path: p, mode: "100644", type: "blob", sha: null })),
  ];
  const tree = await ghFetch(gh, `/repos/${gh.repo}/git/trees`, {
    method: "POST",
    body: { base_tree: baseCommit.data?.tree?.sha, tree: treeEntries },
  });
  if (!tree.ok) return `ERROR: could not build tree: ${tree.data?.message ?? tree.status}`;

  // Trailer makes every assistant-driven commit attributable to the staff
  // member who asked for it — this repo is a payroll system of record.
  const message = `${input.message}\n\nPushed-via: TimeVault kimi-agent for ${userEmail}`;
  const commit = await ghFetch(gh, `/repos/${gh.repo}/git/commits`, {
    method: "POST",
    body: { message, tree: tree.data?.sha, parents: [baseSha] },
  });
  if (!commit.ok) return `ERROR: could not create commit: ${commit.data?.message ?? commit.status}`;

  const updated = await ghFetch(gh, `/repos/${gh.repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: { sha: commit.data?.sha, force: false },
  });
  if (!updated.ok) return `ERROR: could not update ${branch}: ${updated.data?.message ?? updated.status}`;

  const url = `https://github.com/${gh.repo}/commit/${commit.data?.sha}`;
  const fileList = [
    ...input.files.map((f) => f.path),
    ...input.deletePaths.map((p) => `${p} (deleted)`),
  ];
  actions.push({
    type: "github_commit",
    summary: `Committed ${fileList.length} file${fileList.length === 1 ? "" : "s"} to ${branch}`,
    url,
  });
  const lovableNote =
    branch === gh.branch
      ? ` This is the Lovable-synced branch: Lovable pulls the change automatically and the app preview updates; the production site still needs Publish in Lovable.`
      : ` This branch is NOT synced to the live app until it is merged into ${gh.branch}.`;
  return `Committed to ${branch}: ${commit.data?.sha}\nFiles: ${fileList.join(", ")}\n${url}${lovableNote} CI (tests + build) runs on GitHub for this commit — mention that you could not run tests yourself.`;
}

async function githubOpenPr(
  gh: GithubConfig,
  input: { title: string; body: string; branch: string; base: string },
  actions: AgentAction[]
): Promise<string> {
  const res = await ghFetch(gh, `/repos/${gh.repo}/pulls`, {
    method: "POST",
    body: {
      title: input.title,
      body: input.body,
      head: input.branch,
      base: input.base || gh.branch,
    },
  });
  if (!res.ok) {
    const detail = res.data?.errors?.[0]?.message ?? res.data?.message ?? res.status;
    return `ERROR: could not open pull request: ${detail}`;
  }
  actions.push({
    type: "github_pr",
    summary: `Opened PR #${res.data?.number}: ${bounded(input.title, 60)}`,
    url: res.data?.html_url,
  });
  return `Opened pull request #${res.data?.number}: ${res.data?.html_url}\nCI must pass and a human merges it in GitHub; after merge, Lovable syncs the change automatically.`;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

const SITE_PRIMER =
  "THE SITE (so you know what you're standing in and what you'd be editing): TimeVault, the office's internal web app — repo mvincen55/clock-wise-keeper on GitHub, built and hosted with Lovable, which two-way syncs the repo's default branch. Features: time clock with punches and geofenced work zones; schedules and attendance review; PTO requests and approvals; payroll export (this is the payroll system of record — time math is owned by Postgres triggers, times are America/New_York wall time, be extremely careful in that area); the FOF builder (Financial Options Forms: CDT-code fee schedules, insurance estimates, discounts, AI-named visits, print sheets, templates); Policy Manual and an office document knowledge base with AI search; Deposit Log; Important Numbers; checklists; notifications. Stack: Vite + React 18 + TypeScript + Tailwind + shadcn/ui, TanStack Query, React Router, Capacitor wrapper; backend is Supabase (Lovable Cloud): Postgres with strict RLS, Deno edge functions in supabase/functions/, migrations in supabase/migrations/. Frontend lives in src/ (pages/, components/, hooks/, lib/ — FOF logic in src/lib/fof). CI on GitHub Actions runs bun test and a production build on every push and PR.";

const POLICY_SUMMARY =
  "Office FOF policy facts you may explain: prepay-in-full earns the prepay discount (10% standard; Illumitrac seniors +5%); patient portions under $1,000 are simply paid at the visit (nothing due at scheduling); larger plans collect a full visit ahead so the patient never carries a balance, with the final visit split half ahead / half at the visit; work-up procedures and surgical guides are billed at their visit, never prepaid; most plans pay composite rates — downgrades are off by default and only turned on for plans like Altus, which pay on the amalgam fee with the patient responsible up to the office fee; finished lab work is always 'delivered' (Crown Delivery, Denture Delivery, Implant Crown Delivery — never 'seating'); fillings are described without surfaces; D4265, D4268, D5982, and D7953 are never insurance-covered.";

interface PromptContext {
  mode: "fof" | "ask";
  isManager: boolean;
  training: boolean;
  githubReady: boolean;
  memories: { id: string; kind: string; content: string }[];
  guidance: string[];
  procedureNotes: string[];
  visits: string;
  treatment: string;
  docCount: number;
}

function buildSystemPrompt(ctx: PromptContext): string {
  const parts: string[] = [];

  parts.push(
    ctx.mode === "fof"
      ? "You are the FOF Assistant inside a dental office's Financial Options Form builder — a sharp, friendly treatment-coordination colleague. You help staff with the form's wording, payment schedules, and office policy questions, you refine how AI-written treatment summaries read, and for managers you are also the office's build partner for this app."
      : "You are the office's AI assistant on the Ask AI page of TimeVault, their internal app — a sharp, friendly colleague. You answer questions from the office's own documents and standing knowledge, and for managers you are also the build partner for the app itself."
  );
  parts.push("You are Kimi (Moonshot AI's Kimi K3) running through OpenRouter.");
  parts.push(SITE_PRIMER);

  // --- capabilities, honestly stated, per role -----------------------------
  const capabilities: string[] = [
    "answer questions and discuss anything above",
    `search the office document knowledge base with search_office_docs (${ctx.docCount} document${ctx.docCount === 1 ? "" : "s"} indexed)`,
  ];
  if (ctx.isManager) {
    capabilities.push(
      "save durable memories with save_memory (kind 'office' for practice facts, 'site' for app/build facts) and retire wrong ones with forget_memory"
    );
    if (ctx.mode === "fof" && ctx.training) {
      capabilities.push("save standing FOF wording rules with save_wording_rule");
    }
    if (ctx.githubReady) {
      capabilities.push(
        "read this app's real source (github_list_files, github_read_file) and change it (github_commit_files, github_open_pr)"
      );
    }
  }
  parts.push(
    `CAPABILITIES — BE HONEST ABOUT THEM. The only things you can actually do are: ${capabilities.join("; ")}. Never claim you did something outside that list, and only say you saved/committed/opened something when the tool call succeeded this turn. If a tool errors, say so plainly.`
  );

  if (ctx.isManager) {
    if (ctx.githubReady) {
      parts.push(
        "BUILDING THE APP (managers only — that is who you are talking to): work like a careful engineer. Read the relevant files with github_read_file BEFORE editing; match the codebase's existing patterns; keep commits small and focused; never invent file contents. github_commit_files replaces whole files, so include the complete new file content, not a diff. Choosing where to push: when the user clearly says push/ship/send it, commit straight to the default branch — Lovable syncs it automatically and the app updates (that IS how you 'talk to Lovable'); for anything risky (payroll/time math, RLS, migrations, auth) or when they want review, commit to a new feature branch and open a PR with github_open_pr so CI and a human gate it. You cannot run the tests yourself — CI runs them on GitHub after you push; say that. PUBLISHING: the production site updates only when a human clicks Publish in Lovable — you cannot click it; after pushing, tell them 'preview updates automatically; hit Publish in Lovable when you want it live.' When a task genuinely suits Lovable's own AI better (big visual redesigns, new Lovable Cloud/backend wiring, anything needing its editor), say so and give them a short ready-to-paste prompt for the Lovable chat, clearly labeled 'Prompt for Lovable:'. Database schema changes need a migration file AND someone to run it — flag that migrations in a commit do not apply themselves to the live database."
      );
    } else {
      parts.push(
        "BUILD TOOLS NOT CONFIGURED: GitHub access is not set up (missing GITHUB_TOKEN secret), so you cannot read or change the app's code right now. If asked to build, explain a manager must add the GITHUB_TOKEN secret per docs/kimi-assistant.md, and offer a ready-to-paste 'Prompt for Lovable:' as the alternative."
      );
    }
    parts.push(
      "MEMORY — remember as we go: when the user states a durable fact, preference, or decision about the office (people, policies, how they like things) or about the site (product decisions, todos, how something is built), save it with save_memory without being asked — one crisp fact per memory, general wording, max 300 characters, and NEVER a patient detail. Confirm in your reply what you remembered. Use forget_memory (by id) when the user retracts or corrects one. Do not save trivia, one-off questions, or anything about a patient."
    );
  } else {
    parts.push(
      "The user is a TEAM MEMBER (not a manager): answer questions helpfully, but you have no build, memory, or training tools for them — nothing they say changes standing knowledge or the app. If they state a preference or want something built, suggest they raise it with the office manager."
    );
  }

  // --- standing knowledge --------------------------------------------------
  if (ctx.memories.length > 0) {
    const office = ctx.memories.filter((m) => m.kind === "office");
    const site = ctx.memories.filter((m) => m.kind === "site");
    const fmt = (rows: typeof ctx.memories) =>
      rows.map((m) => `[${m.id.slice(0, 8)}] ${m.content}`).join(" | ");
    parts.push(
      `STANDING MEMORY (saved in past chats; ids in brackets are for forget_memory):${
        office.length ? ` OFFICE: ${fmt(office)}` : ""
      }${site.length ? ` SITE: ${fmt(site)}` : ""}`
    );
  }
  if (ctx.procedureNotes.length > 0) {
    parts.push(
      `PER-PROCEDURE OFFICE NOTES (wording/policy managers set per procedure on the fee schedule — authoritative for those procedures): ${ctx.procedureNotes.map((n, i) => `(${i + 1}) ${n}`).join(" ")}`
    );
  }

  // --- mode specifics ------------------------------------------------------
  if (ctx.mode === "fof") {
    parts.push(POLICY_SUMMARY);
    if (ctx.guidance.length > 0) {
      parts.push(
        `STANDING WORDING RULES already in effect (from past training): ${ctx.guidance.map((g, i) => `(${i + 1}) ${g}`).join(" ")}`
      );
    }
    if (ctx.visits) parts.push(`The current form's procedures (de-identified, by visit):\n${ctx.visits}`);
    if (ctx.treatment) parts.push(`The current AI-written treatment summary: "${ctx.treatment}"`);
    parts.push(
      ctx.isManager
        ? ctx.training
          ? 'TRAINING IS ON: when the manager states a wording preference, correction, or standing policy for how treatment summaries or payment names should read (e.g. "never say X, say Y", "the doctor prefers..."), distill it into ONE short, general, imperative rule (max 200 characters, no patient or staff names other than doctor titles, no case-specific details) and call save_wording_rule. Confirm in your reply what was saved. A saved rule shapes AI wording only — it never changes pricing, fees, or what a membership includes; those live in Fee Schedules/Templates configuration (which you CAN change in code only if the user explicitly wants an app change).'
          : "TRAINING IS PAUSED: answer normally but never call save_wording_rule — mention they can flip Training mode back on if they clearly want something saved."
        : "The user cannot train wording rules (managers only)."
    );
  } else {
    parts.push(
      "ANSWERING FROM DOCUMENTS: for questions about office policy, HR, PTO rules, or insurance, call search_office_docs FIRST with 2-5 short keyword queries (expand shorthand: 'DD MA' → Delta Dental, 'pt' → patient) and answer ONLY from what comes back — never invent policy details or rates. Apply the returned rules to the user's scenario and give your read; if the excerpts don't settle it, say what they do establish and what to check. If nothing matches, say so in one sentence and point to which document might have it, or suggest a manager upload it."
    );
  }

  // --- voice + privacy -----------------------------------------------------
  parts.push(
    "VOICE: talk like a helpful coworker, not a policy lawyer. Lead with the answer. Keep it SHORT — a few sentences for most questions, a brief list only when it genuinely helps, no headings. Mention a source document casually once ('per the DD MA manual') rather than formal citations. When discussing phrasing, suggest exact wording. When discussing code you changed, name the files and what changed in plain words."
  );
  parts.push(
    "PRIVACY — HARD RULE: you never know who a patient is and must keep it that way. If a message contains a patient's name or personal details, do NOT repeat them, do NOT store them in any memory, rule, code, or commit message, and gently remind the user not to share patient information here. Office documents and memories are business information only."
  );

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Tool schemas (OpenAI function-call format, filtered by role/mode)
// ---------------------------------------------------------------------------

function buildTools(ctx: { isManager: boolean; training: boolean; mode: string; githubReady: boolean }) {
  // deno-lint-ignore no-explicit-any
  const tools: any[] = [
    {
      type: "function",
      function: {
        name: "search_office_docs",
        description:
          "Full-text search over the office's uploaded documents (policies, HR, insurance manuals). Provide 1-5 short keyword queries (1-3 words each); returns the best-matching excerpts.",
        parameters: {
          type: "object",
          properties: {
            queries: {
              type: "array",
              items: { type: "string" },
              description: "1-5 short keyword queries, e.g. [\"PTO accrual\", \"crown replacement\"]",
            },
          },
          required: ["queries"],
        },
      },
    },
  ];
  if (!ctx.isManager) return tools;

  tools.push(
    {
      type: "function",
      function: {
        name: "save_memory",
        description:
          "Save ONE durable fact to standing memory so every future conversation knows it. kind 'office' = practice facts (people, policies, preferences); kind 'site' = facts about this app (decisions, todos, how things work). Never patient details.",
        parameters: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["office", "site"] },
            content: { type: "string", description: "The fact, crisp and general, max 300 chars." },
          },
          required: ["kind", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "forget_memory",
        description: "Retire a standing memory that is wrong or outdated, by the id shown in brackets in STANDING MEMORY.",
        parameters: {
          type: "object",
          properties: { memory_id: { type: "string", description: "Full or 8-char id from the memory list." } },
          required: ["memory_id"],
        },
      },
    }
  );

  if (ctx.mode === "fof" && ctx.training) {
    tools.push({
      type: "function",
      function: {
        name: "save_wording_rule",
        description:
          "Save a standing FOF wording rule every future AI-written treatment summary follows. One short, general, imperative rule, max 200 chars, no patient details.",
        parameters: {
          type: "object",
          properties: { rule: { type: "string" } },
          required: ["rule"],
        },
      },
    });
  }

  if (ctx.githubReady) {
    tools.push(
      {
        type: "function",
        function: {
          name: "github_list_files",
          description: "List files in the app's GitHub repo (Lovable-synced source of this very app).",
          parameters: {
            type: "object",
            properties: {
              prefix: { type: "string", description: "Optional path prefix filter, e.g. \"src/pages/\"" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "github_read_file",
          description: "Read one text file from the repo. Always read a file before editing it.",
          parameters: {
            type: "object",
            properties: { path: { type: "string", description: "Repo-relative path, e.g. \"src/pages/Assistant.tsx\"" } },
            required: ["path"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "github_commit_files",
          description:
            "Commit up to 10 complete text files to the repo in one atomic commit. Each file's content REPLACES the whole file. Omit branch to push to the Lovable-synced default branch (app updates automatically); pass a new branch name to stage work for a PR instead. Text files only.",
          parameters: {
            type: "object",
            properties: {
              message: { type: "string", description: "Imperative commit message, first line under 70 chars." },
              files: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    content: { type: "string", description: "FULL new file content." },
                  },
                  required: ["path", "content"],
                },
              },
              delete_paths: { type: "array", items: { type: "string" }, description: "Optional paths to delete." },
              branch: { type: "string", description: "Optional branch; created from the default branch if missing." },
            },
            required: ["message", "files"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "github_open_pr",
          description: "Open a pull request from a branch you committed to, into the default branch, for CI + human review.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              body: { type: "string", description: "What changed and why, plus anything the reviewer should check." },
              branch: { type: "string", description: "Head branch with your commits." },
              base: { type: "string", description: "Optional base branch; defaults to the repo's default branch." },
            },
            required: ["title", "branch"],
          },
        },
      }
    );
  }
  return tools;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    // User-facing problems return 200 with {error}: supabase-js hides the
    // body of non-2xx function responses, and both UIs surface data.error.
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return json({
        error: "Kimi is not configured yet — add the OPENROUTER_API_KEY secret (see docs/kimi-assistant.md).",
      });
    }
    const model = Deno.env.get("OPENROUTER_MODEL") ?? DEFAULT_MODEL;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "Unauthorized" }, 403);
    const isManager = membership.role === "owner" || membership.role === "manager";

    const body = (await req.json()) as {
      mode?: string;
      messages?: { role?: string; content?: string }[];
      context?: { visits?: { procedures?: string[] }[]; treatment?: string };
      trainingEnabled?: boolean;
    };
    const mode: "fof" | "ask" = body.mode === "fof" ? "fof" : "ask";
    const chat = (Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [])
      .map((m) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: boundedText(m?.content, MAX_MESSAGE_CHARS),
      }))
      .filter((m) => m.content !== "");
    if (chat.length === 0 || chat[chat.length - 1].role !== "user") {
      return json({ error: "Bad request" }, 400);
    }
    const training = mode === "fof" && isManager && body.trainingEnabled !== false;

    // De-identified FOF context (same caps and derivation as fof-assistant).
    const visits = (Array.isArray(body.context?.visits) ? body.context!.visits! : [])
      .slice(0, MAX_VISITS)
      .map(
        (v, i) =>
          `Visit ${i + 1}: ${(Array.isArray(v?.procedures) ? v.procedures! : [])
            .slice(0, MAX_PROCEDURES_PER_VISIT)
            .map((p) => bounded(p, MAX_LABEL_CHARS))
            .filter(Boolean)
            .join(", ") || "—"}`
      )
      .join("\n");
    const treatment = bounded(body.context?.treatment, MAX_TREATMENT_CHARS);

    // Standing knowledge, all under the caller's JWT so RLS scopes the org.
    const [memoriesRes, guidanceRes, docsRes, procedureNotes] = await Promise.all([
      supabase
        .from("assistant_memories")
        .select("id, kind, content")
        .eq("org_id", membership.org_id)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(MAX_MEMORIES_IN_PROMPT),
      mode === "fof"
        ? supabase
            .from("fof_ai_guidance")
            .select("content")
            .eq("org_id", membership.org_id)
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(30)
        : Promise.resolve({ data: [] }),
      supabase.from("office_docs").select("id").limit(200),
      loadProcedureNotes(supabase),
    ]);
    const memories = ((memoriesRes.data ?? []) as { id: string; kind: string; content: string }[]).map(
      (m) => ({ id: m.id, kind: m.kind, content: bounded(m.content, MAX_MEMORY_CHARS) })
    );
    const guidance = ((guidanceRes.data ?? []) as { content: string }[])
      .map((g) => bounded(g.content, 240))
      .filter(Boolean);

    const gh = githubConfig();
    const githubReady = isManager && gh !== null;
    const systemPrompt = buildSystemPrompt({
      mode,
      isManager,
      training,
      githubReady,
      memories,
      guidance,
      procedureNotes,
      visits,
      treatment,
      docCount: docsRes.data?.length ?? 0,
    });
    const tools = buildTools({ isManager, training, mode, githubReady });

    const actions: AgentAction[] = [];
    const savedRules: string[] = [];
    const sources = new Map<string, AgentSource>();

    // deno-lint-ignore no-explicit-any
    const executeTool = async (name: string, args: any): Promise<string> => {
      switch (name) {
        case "search_office_docs":
          return await searchOfficeDocs(supabase, Array.isArray(args?.queries) ? args.queries : [], sources);
        case "save_memory": {
          if (!isManager) return "ERROR: only managers can save memories.";
          const kind = args?.kind === "site" ? "site" : args?.kind === "office" ? "office" : null;
          const content = boundedText(args?.content, MAX_MEMORY_CHARS);
          if (!kind || !content) return "ERROR: save_memory needs kind ('office'|'site') and content.";
          const { data, error } = await supabase
            .from("assistant_memories")
            .insert({ org_id: membership.org_id, kind, content, created_by: user.id })
            .select("id")
            .single();
          if (error) return `ERROR: could not save memory: ${error.message}`;
          // Keep the in-turn list current so a same-turn forget can find it.
          memories.push({ id: String(data.id), kind, content });
          actions.push({ type: "memory_saved", summary: `Remembered (${kind}): ${bounded(content, 80)}` });
          return `Saved ${kind} memory [${String(data.id).slice(0, 8)}]: ${content}`;
        }
        case "forget_memory": {
          if (!isManager) return "ERROR: only managers can retire memories.";
          const raw = bounded(args?.memory_id, 40).toLowerCase();
          if (!raw) return "ERROR: forget_memory needs memory_id.";
          const match = memories.find((m) => m.id === raw || m.id.startsWith(raw));
          if (!match) return `ERROR: no active memory with id ${raw}.`;
          const { error } = await supabase
            .from("assistant_memories")
            .update({ is_active: false })
            .eq("id", match.id);
          if (error) return `ERROR: could not retire memory: ${error.message}`;
          actions.push({ type: "memory_forgotten", summary: `Forgot: ${bounded(match.content, 80)}` });
          return `Retired memory [${match.id.slice(0, 8)}] ("${match.content}").`;
        }
        case "save_wording_rule": {
          if (!training) return "ERROR: training is off — wording rules cannot be saved right now.";
          const rule = bounded(args?.rule, 220);
          if (!rule) return "ERROR: save_wording_rule needs a rule.";
          const { error } = await supabase
            .from("fof_ai_guidance")
            .insert({ org_id: membership.org_id, content: rule, created_by: user.id });
          if (error) return `ERROR: could not save rule: ${error.message}`;
          savedRules.push(rule);
          actions.push({ type: "rule_saved", summary: `Saved wording rule: ${bounded(rule, 80)}` });
          return `Saved standing wording rule: ${rule}`;
        }
        case "github_list_files": {
          if (!isManager) return "ERROR: managers only.";
          if (!gh) return NOT_CONFIGURED;
          const prefix = safeRepoPath(args?.prefix) ?? "";
          return await githubListFiles(gh, prefix);
        }
        case "github_read_file": {
          if (!isManager) return "ERROR: managers only.";
          if (!gh) return NOT_CONFIGURED;
          const path = safeRepoPath(args?.path);
          if (!path) return "ERROR: invalid path.";
          return await githubReadFile(gh, path);
        }
        case "github_commit_files": {
          if (!isManager) return "ERROR: managers only.";
          if (!gh) return NOT_CONFIGURED;
          const message = bounded(args?.message, 500);
          const rawFiles = Array.isArray(args?.files) ? args.files.slice(0, MAX_COMMIT_FILES) : [];
          const files: { path: string; content: string }[] = [];
          for (const f of rawFiles) {
            const path = safeRepoPath(f?.path);
            const content = typeof f?.content === "string" ? f.content : null;
            if (!path || content === null) return `ERROR: invalid file entry ${JSON.stringify(f?.path ?? null)}.`;
            if (content.length > MAX_FILE_CHARS) return `ERROR: ${path} exceeds ${MAX_FILE_CHARS} chars.`;
            files.push({ path, content });
          }
          const deletePaths = (Array.isArray(args?.delete_paths) ? args.delete_paths.slice(0, 10) : [])
            .map((p: unknown) => safeRepoPath(p))
            .filter((p: string | null): p is string => p !== null);
          if (!message || (files.length === 0 && deletePaths.length === 0)) {
            return "ERROR: github_commit_files needs a message and at least one file or delete_path.";
          }
          const branch = bounded(args?.branch, 120).replace(/[^A-Za-z0-9._\/-]/g, "");
          return await githubCommitFiles(gh, { message, files, deletePaths, branch }, user.email ?? user.id, actions);
        }
        case "github_open_pr": {
          if (!isManager) return "ERROR: managers only.";
          if (!gh) return NOT_CONFIGURED;
          const title = bounded(args?.title, 200);
          const branch = bounded(args?.branch, 120);
          if (!title || !branch) return "ERROR: github_open_pr needs title and branch.";
          return await githubOpenPr(
            gh,
            { title, body: boundedText(args?.body, 4000), branch, base: bounded(args?.base, 120) },
            actions
          );
        }
        default:
          return `ERROR: unknown tool ${name}.`;
      }
    };

    // ---- agent loop --------------------------------------------------------
    // deno-lint-ignore no-explicit-any
    const convo: any[] = [{ role: "system", content: systemPrompt }, ...chat];
    let reply = "";
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const outOfTime = Date.now() - startedAt > SOFT_DEADLINE_MS;
      const finalizing = round === MAX_TOOL_ROUNDS || outOfTime;
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/mvincen55/clock-wise-keeper",
          "X-Title": "TimeVault Office Assistant",
        },
        body: JSON.stringify({
          model,
          messages: convo,
          // Tools stay declared even on the final round (tool messages in
          // history need them); tool_choice "none" forces a text reply.
          ...(tools.length > 0 ? { tools, tool_choice: finalizing ? "none" : "auto" } : {}),
          max_tokens: 4000,
          temperature: 0.6,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (response.status === 429) {
        return json({ error: "Kimi is receiving too many requests. Try again in a moment." });
      }
      if (response.status === 402) {
        return json({ error: "OpenRouter credits are exhausted — add credits at openrouter.ai." });
      }
      if (response.status === 401) {
        return json({ error: "OpenRouter rejected the API key — check the OPENROUTER_API_KEY secret." });
      }
      if (!response.ok) {
        const detail = await response.text();
        console.error("OpenRouter error:", response.status, detail.slice(0, 500));
        return json({ error: "AI request failed. Try again." });
      }
      const completion = await response.json();
      const message = completion.choices?.[0]?.message;
      if (!message) return json({ error: "AI returned no reply" });

      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (toolCalls.length === 0 || finalizing) {
        reply = typeof message.content === "string" ? message.content.trim() : "";
        break;
      }

      // Echo the assistant turn (with any reasoning details some Kimi
      // variants emit — OpenRouter wants them passed back unmodified for
      // tool-call continuity), then run every requested tool.
      convo.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
        ...(message.reasoning ? { reasoning: message.reasoning } : {}),
        ...(message.reasoning_details ? { reasoning_details: message.reasoning_details } : {}),
      });
      for (const tc of toolCalls) {
        const name = tc?.function?.name ?? "";
        // deno-lint-ignore no-explicit-any
        let args: any = {};
        try {
          args = JSON.parse(tc?.function?.arguments || "{}");
        } catch {
          /* leave args empty; executor reports the problem */
        }
        let result: string;
        try {
          result = await executeTool(name, args);
        } catch (err) {
          result = `ERROR: ${err instanceof Error ? err.message : "tool failed"}`;
        }
        convo.push({ role: "tool", tool_call_id: tc.id, name, content: result });
      }
    }

    if (!reply) {
      reply = actions.length > 0
        ? "Done — see the actions below. (I ran out of room to write a summary.)"
        : "";
    }
    if (!reply) return json({ error: "AI returned no reply" });

    return json({
      reply: reply.slice(0, 8000),
      savedRules,
      actions,
      sources: [...sources.values()],
    });
  } catch (err) {
    console.error("kimi-agent error:", err);
    return json({ error: "Something went wrong on the assistant's side. Try again in a moment." });
  }
});
