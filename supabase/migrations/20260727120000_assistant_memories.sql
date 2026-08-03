-- Durable memory for the Kimi office assistant ("remember as we go"):
-- managers teach it facts about the office (how the practice runs) and the
-- site (how this app is built / decisions made) through chat, and every
-- future conversation loads them. BUSINESS/BUILD facts only — the
-- assistant is instructed never to store patient details, and staff-facing
-- copy repeats the rule.
CREATE TABLE public.assistant_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- 'office' = practice facts (people, policies, preferences);
  -- 'site'   = facts about this app (features, build decisions, todos).
  kind text NOT NULL CHECK (kind IN ('office', 'site')),
  content text NOT NULL,
  created_by uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assistant_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read assistant_memories"
  ON public.assistant_memories FOR SELECT
  TO authenticated
  USING (is_org_member(org_id));

-- Only managers/owners teach or retire memories.
CREATE POLICY "Admins manage assistant_memories"
  ON public.assistant_memories FOR ALL
  TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE TRIGGER update_assistant_memories_updated_at
  BEFORE UPDATE ON public.assistant_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
