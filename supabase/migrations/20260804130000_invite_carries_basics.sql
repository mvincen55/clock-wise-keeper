-- The Basics questions (what to call them, side of office, report tag) are
-- answered by the inviting owner/manager on the invite, alongside the name
-- and operational roles that already ride there. accept-invite applies them
-- to the employees row, so onboarding never has to ask.
ALTER TABLE public.org_invites
  ADD COLUMN IF NOT EXISTS invited_preferred_name text,
  ADD COLUMN IF NOT EXISTS invited_team text,
  ADD COLUMN IF NOT EXISTS invited_tag text;

DO $$ BEGIN
  ALTER TABLE public.org_invites
    ADD CONSTRAINT org_invites_invited_team_check CHECK (
      invited_team IS NULL OR invited_team = ANY (ARRAY['clinical','clerical'])
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.org_invites
    ADD CONSTRAINT org_invites_invited_tag_check CHECK (
      invited_tag IS NULL OR invited_tag ~ '^[A-Z0-9]{2,4}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
