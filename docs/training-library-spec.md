# Training Library — feature spec (as prompted to Lovable)

Status (2026-07-30): initial prompt sent. Prompt 9 (in `docs/goals-and-bypass-spec.md`)
extends it with read-aloud + roleplay assessments.

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
   generation AND roleplay rubric scoring use the strongest available model (cost
   explicitly approved); polish/chat/drafts and the live roleplay persona use the
   fast model.
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
  a mismatch renders blank modules. Roleplay adds a second shape (persona + rubric) —
  same rule.
- **training-builder must deploy** (new edge function) — probe per
  `docs/runbook.md` §1 if "Build with AI" toasts a function error.
