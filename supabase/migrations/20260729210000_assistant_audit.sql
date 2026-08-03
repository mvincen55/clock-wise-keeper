-- Assistant memory conflict handling + auditor findings.
--
-- Two changes:
--
-- 1. Memories gain a lifecycle. A fact that CONTRADICTS something the
--    assistant was already told must never quietly overwrite it — it is
--    stored 'pending' with the conflict recorded, and an owner/manager
--    decides which version is true. Nothing pending is ever fed to the AI.
--
-- 2. An auditor records findings: contradictions between memories, and
--    knowledge filed in the wrong place. "Right place" for procedure
--    knowledge is a note on a fee_schedule_items row — on the OFFICE
--    schedule when the guidance is universal (applies to every patient
--    regardless of carrier), or on a CARRIER schedule when it only
--    applies to billing that code to that specific insurance.
--
-- De-identified configuration only — never patient information.

ALTER TABLE public.assistant_memories
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'superseded')),
  -- The memory this one would replace, when a manager accepts it.
  ADD COLUMN supersedes_id uuid REFERENCES public.assistant_memories(id) ON DELETE SET NULL,
  -- Plain-English description of the clash, shown to the manager.
  ADD COLUMN conflict_note text NOT NULL DEFAULT '';

-- Only 'active' rows are ever loaded into a prompt; this is the hot path.
CREATE INDEX assistant_memories_active_idx
  ON public.assistant_memories (org_id, status)
  WHERE is_active AND status = 'active';

-- Pending conflicts drive the review queue.
CREATE INDEX assistant_memories_pending_idx
  ON public.assistant_memories (org_id, created_at DESC)
  WHERE is_active AND status = 'pending';

CREATE TABLE public.assistant_audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- memory_contradiction : two active memories disagree
  -- note_misfiled        : universal guidance stuck on one carrier, or a
  --                        carrier-specific rule sitting on the office
  --                        schedule where it would apply to everyone
  -- code_fact_in_memory  : procedure knowledge kept as chat memory when it
  --                        belongs in that code's fee-schedule note
  kind text NOT NULL CHECK (kind IN (
    'memory_contradiction', 'note_misfiled', 'code_fact_in_memory', 'other'
  )),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
  title text NOT NULL,
  detail text NOT NULL DEFAULT '',
  -- What one-click fix to offer, e.g.
  -- {"type":"move_note","code":"D2740","from_schedule_id":..,"to_schedule_id":..,"note":".."}
  suggested_action jsonb,
  memory_id uuid REFERENCES public.assistant_memories(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  -- Stable hash of what the finding is about, so a nightly re-run
  -- re-reports nothing the manager has already seen or cleared.
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid
);

-- One OPEN finding per distinct problem; cleared ones may recur later.
CREATE UNIQUE INDEX assistant_audit_findings_open_uidx
  ON public.assistant_audit_findings (org_id, fingerprint)
  WHERE status = 'open';

CREATE INDEX assistant_audit_findings_open_idx
  ON public.assistant_audit_findings (org_id, created_at DESC)
  WHERE status = 'open';

ALTER TABLE public.assistant_audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read assistant_audit_findings"
  ON public.assistant_audit_findings FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

-- Only managers/owners clear or act on findings.
CREATE POLICY "Admins manage assistant_audit_findings"
  ON public.assistant_audit_findings FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER update_assistant_audit_findings_updated_at
  BEFORE UPDATE ON public.assistant_audit_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
