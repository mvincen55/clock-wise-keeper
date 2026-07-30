# Training Library — feature spec (as prompted to Lovable)

Status (2026-07-30): initial prompt sent (Training.tsx exists). Prompt 9 (in
`docs/goals-and-bypass-spec.md`) extends it with read-aloud + roleplay assessments.
Prompt 12 (below) adds the training auditor + learning-style adaptation.

## Product decisions (the "why")

1. **One library, everything flows into it.** Manager-built, member-written, and
   AI-built modules all live in `training_modules`. Goal resources reference the
   library via `training_modules.origin_goal_id`; they are never a parallel silo.
2. **AI-generated content must be grounded in how THIS office runs.** Authority
   order: `assistant_memories` (rules the office taught the assistant —
   authoritative) > office docs / policy manual corpus > org configuration.
   The rules of the office are the rules of the world: no generic advice that
   contradicts office policy, fictional scenarios only, never patient data.
3. **Premium model for content, cheap model for chatter.** Module/quiz/roleplay
   generation, roleplay rubric scoring, AND training audits use the strongest
   available model (cost explicitly approved); polish/chat/drafts and the live
   roleplay persona use the fast model.
4. **Member-created modules go straight into the library** — no approval queue
   (same philosophy as goals). Source badge keeps provenance honest; managers
   can archive anything off-base.
5. **Quiz answers are private; pass/fail is not.** Assigners/admins see assignment
   status and pass/fail — never per-question answers or roleplay transcripts.
   For goal-linked modules, the team sees "completed", never scores.
6. **Anyone with admin rights can assign to anyone** — owner → manager, manager →
   themselves, etc.
7. **Modules are listenable** (Prompt 9): a "Listen" button in the module player
   reads outcome/sections/recap aloud using browser speech synthesis — no server
   cost, play/pause, auto-stop on leave.
8. **Assessments match the skill** (Prompt 9): recall → scenario quiz; interpersonal
   → live roleplay with an AI persona (named patient, insurance rep) grounded in
   office policy, scored by the strong model against a rubric at an 80% bar,
   unlimited retakes. training_attempts gains type ('quiz' | 'roleplay');
   transcripts stay in answers jsonb under the same privacy rule as quiz answers.
   Passing either assessment completes the assignment.
9. **Every module gets audited by a second AI** (Prompt 12): training-auditor
   mirrors the assistant-auditor pattern — checks contradiction / inappropriate /
   incorrect / patient_data against office rules, fingerprinted findings,
   proposes-but-never-applies, FAIL-OPEN (an auditor outage never blocks
   publishing). Findings are a MANAGER surface ("Needs review" badge); staff never
   see the auditor. Clean modules show a quiet "Audited" mark.
10. **Modules adapt to how the member learns** (Prompt 12): training-builder reads
    work_style_profiles (stealth — same rule as goals: NEVER reveal the adaptation).
    Visual → diagram/flowchart blocks ({ type: 'visual' } rendered as CSS/SVG cards;
    AI-generated imagery is a refinement-pass upgrade); auditory → listen-first;
    readers → text-first + reflection; hands-on → practice-first. Assessments adapt
    too (visual questions / read-aloud questions / roleplay "show me"). Fully
    adaptive for member-specific modules; balanced mix for general library modules
    and members without a profile.

## The prompt (as given to Lovable)

> Build a Training Library: one central database of training modules for the whole practice, with assignments. Conventions: org_id on every table, RLS on everything, roles owner/manager/employee, React + shadcn/ui. This is the foundation that Goals' Pathfinder resources will plug into later — build it standalone for now.
>
> NEW TABLES (org_id + RLS per existing patterns):
> - training_modules: id, org_id, title, summary, audience_tags text[] (positions/roles it applies to, e.g. front desk, assistant, all), content jsonb, source ('pathfinder' | 'staff'), origin_goal_id nullable, status ('published' | 'archived'), created_by, created_at, updated_at. RLS: everyone in the org reads published modules; any member can insert (their own creation or AI-built for them — source tracks which); only owners/managers update or archive.
> - training_assignments: id, org_id, module_id, assigned_to (user_id), assigned_by, due_date nullable, status ('assigned' | 'in_progress' | 'completed'), completed_at nullable, created_at. RLS: admins create and read all in their org; the assignee reads their own and updates only their own status.
> - training_attempts: id, org_id, module_id, user_id, score int, passed bool, answers jsonb, completed_at. RLS: member writes and reads their own attempts; admins see assignment status and pass/fail ONLY — never the answers jsonb.
>
> Module content jsonb shape (enforce everywhere): { outcome, sections: [{ heading, body, try_it }], recap, quiz: { questions: [{ q, options[], correct_index, why }] } | null }.
>
> NEW PAGE /training ("Training"), added to the main nav:
> 1. LIBRARY: grid of all published modules — title, summary, audience tags, source badge ("Built by Pathfinder" vs "By [name]"), and assignment stats for admins. Filter by audience tag.
> 2. MY TRAINING: the member's assignments with due dates and state; overdue shows amber. Assigned modules open the module player.
> 3. MODULE PLAYER: well-designed reading experience — outcome up front, sections with concrete scenarios and a "try it today" action each, recap, then the quiz if present: scenario questions, per-question feedback explaining WHY, 80% pass, unlimited retakes. Module read + quiz passed (or just read, when no quiz) marks the assignment completed.
> 4. MANAGER ACTIONS (owners/managers): "Assign" on any module → pick one or more members (including themselves) + optional due date → creates training_assignments rows and an in-app notification to each assignee via the existing notification system. "Build with AI" → topic + audience → calls the training-builder function below.
>
> NEW EDGE FUNCTION training-builder (verify_jwt = true, add to supabase/config.toml):
> Generates genuinely excellent modules and MUST be grounded in how THIS office actually runs. Before writing anything, gather and use:
> - assistant_memories: the standing facts and rules the office has taught the assistant — these are authoritative. The module must never contradict them; where they're relevant, they ARE the content.
> - The office's documents (policy manual / office docs via the same corpus ask-docs uses): role expectations, procedures, how the doctor wants each position to function.
> - Org settings and configuration: how the doctor set the practice up.
> RULES: the rules of the office are the rules of the world — no generic internet advice that conflicts with office policy; fictional scenarios only, never real patient data; concrete dental-front-office situations; every section ends with a "try it today" action. Output the content jsonb shape exactly.
> MODEL: use the strongest available model for generation — quality first, cost is approved. Save the result to training_modules (source 'pathfinder', status 'published') and return it.
>
> When finished: deploy the training-builder edge function and confirm it's live.

## Prompt 12 — Training auditor + learning-style adaptation (pending)

> Two upgrades to the Training Library: an AI auditor for every module, and learning-style adaptation.
>
> 1) TRAINING AUDITOR (a second AI that never talks to staff — same philosophy as assistant-auditor):
> - New edge function training-auditor (verify_jwt = true, add to supabase/config.toml). After ANY module is created or edited — by training-builder or by a staff member — audit it against: assistant_memories and the office docs (contradictions with office rules and policies), appropriateness (tone, professionalism), correctness (procedural claims about how THIS office actually works), and the no-patient-data rule (fictional scenarios only).
> - Auditing NEVER blocks publishing (fail-open — an auditor outage can't stop training). It runs after save and records findings: training_audit_findings (id, org_id, module_id, finding_type ('contradiction' | 'inappropriate' | 'incorrect' | 'patient_data'), detail, quoted passage, suggested_fix, status ('open' | 'dismissed' | 'fixed'), fingerprint, created_at). Fingerprint findings so re-audits never re-report open or dismissed items, and it PROPOSES fixes — it never edits modules itself.
> - The Training page gets a "Needs review" badge for owners/managers. Each finding shows the quoted passage, why it's a problem, and the suggested fix with one-tap apply or dismiss. Modules with open findings carry a subtle flag; clean modules show a quiet "Audited" mark. Use the strong model for audits.
>
> 2) LEARNING-STYLE-ADAPTIVE MODULES:
> - training-builder now reads work_style_profiles for its audience and adapts the format to how they learn: visual learners get visual-first sections (diagrams and flowcharts as a new styled block type { type: 'visual', title, description, alt } rendered as designed CSS/SVG diagram cards — not generated images); auditory learners get listen-first sections written for the read-aloud player with audio-style Q&A; readers get text-first with written reflection prompts; hands-on learners get practice-first sections (short reading, the try-it action up front).
> - Assessments adapt too: visual learners get scenario/visual questions, auditory learners get questions read aloud, hands-on learners get "show me what you'd do" roleplay-style assessment.
> - Scope: modules built for a specific member (goal-linked or single-assignee) adapt fully to that member; general library modules use a balanced mix of formats; no profile on record → balanced mix.
> - STEALTH RULE (same as goals): NEVER reveal the adaptation anywhere — no "since you're a visual learner…" phrasing in the UI, the module, or AI output. It just happens to fit them.
>
> When finished: deploy the training-auditor edge function and confirm it's live.

## Integration with Goals (baked into Prompt 6)

- goal-assistant's resource behavior calls `training-builder`, then links via
  `training_modules.origin_goal_id`.
- Goal cards show linked modules with the member's state from
  training_assignments/training_attempts.
- Completing a linked module (read + quiz passed) checks off the attached plan task.

## Known build risks

- **Grounding depth is the make-or-break.** If generated modules read like generic
  internet advice, the function isn't actually pulling assistant_memories / docs —
  check the function logs for what context it gathered.
- **content jsonb shape drift.** Player and builder must agree on the shape exactly;
  a mismatch renders blank modules. Roleplay (persona + rubric) and visual blocks
  each add a shape — same rule.
- **training-builder AND training-auditor must deploy** (edge functions) — probe
  per `docs/runbook.md` §1 if "Build with AI" or audits toast a function error.
- **Stealth leaks.** Adaptation must never be visible; if a module ever says
  "as a visual learner", the profile boundary broke — fix the prompt/context,
  not the member's answers.
