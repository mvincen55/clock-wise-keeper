-- Genericization Phase 2c: office vocabulary becomes org settings, and
-- printed deposit wording is snapshotted onto the saved record.
--
-- Kept deliberately minimal per the brief: the audit surfaced only two
-- genuinely office-specific vocabulary items (the membership plan's
-- display name and the doctor dropdown); no new boolean feature toggles
-- were needed — the optional FOF sections are already template flags.

ALTER TABLE public.fof_settings
  -- Display name of the in-house membership plan ("Included with <name>
  -- Membership" on the FOF, the membership row on the Deposit Log).
  -- Empty = plain "Membership". The live org's plan name is applied as
  -- data, not seeded here.
  ADD COLUMN membership_plan_name text NOT NULL DEFAULT '',
  -- Doctors offered in the FOF builder's treatment-wording dropdown.
  -- JSON array of display names; empty = only "No specific doctor".
  ADD COLUMN doctor_names jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Printed wording is captured onto the record at save time, so a later
-- settings or branding edit never changes what a historical printed
-- document said. Null = records saved before this existed; they print
-- with the live settings (unchanged prior behavior).
ALTER TABLE public.deposit_logs
  ADD COLUMN print_snapshot jsonb;
