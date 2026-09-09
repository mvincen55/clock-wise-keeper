-- PENDING — NOT APPLIED. Kept out of supabase/migrations/ on purpose: the
-- implementation task was code-only. Apply this (and the Harelick seed file
-- next to it) through the migration tool when you are ready; until then the
-- app keeps its current behaviour because payment_policy_enabled is false
-- everywhere and the FOF falls back to the legacy schedule.
--
-- FOF payment-plan policy — ORGANIZATION-SCOPED CONFIGURATION ONLY.
--
-- The Financial Options Form's payment schedule was computed by a single
-- hard-coded algorithm (proportional per-visit allocation with a universal
-- "collect the next visit early" rule). Offices differ, so the schedule
-- becomes a setting: thresholds, treatment-class strategies, milestone
-- selection, mixed-treatment grouping and rounding now live on the office's
-- OWN fof_settings row, and payment classification of a procedure lives on
-- the canonical procedure_meta row.
--
-- No competing source of truth is introduced: this EXTENDS fof_settings and
-- procedure_meta, the two tables that already own FOF configuration.
--
-- Legacy safety: payment_policy_enabled defaults to FALSE, so every existing
-- organization keeps exactly the schedule it has today until an owner turns
-- the new engine on. Nothing here is patient data.
--
-- Additive + idempotent.

-- 1) Office payment policy -------------------------------------------------
ALTER TABLE public.fof_settings
  ADD COLUMN IF NOT EXISTS payment_policy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_threshold_cents integer NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS payment_threshold_inclusive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_work_up_codes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_implant_advance_exception boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_mixed_group_uplift boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_combine_mode text NOT NULL DEFAULT 'linked_events',
  ADD COLUMN IF NOT EXISTS payment_rounding text NOT NULL DEFAULT 'last',
  ADD COLUMN IF NOT EXISTS payment_strategies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_milestone_labels jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fof_settings_payment_combine_mode_check'
  ) THEN
    ALTER TABLE public.fof_settings
      ADD CONSTRAINT fof_settings_payment_combine_mode_check
      CHECK (payment_combine_mode IN ('linked_events', 'never'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fof_settings_payment_rounding_check'
  ) THEN
    ALTER TABLE public.fof_settings
      ADD CONSTRAINT fof_settings_payment_rounding_check
      CHECK (payment_rounding IN ('last', 'first'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fof_settings_payment_threshold_check'
  ) THEN
    ALTER TABLE public.fof_settings
      ADD CONSTRAINT fof_settings_payment_threshold_check
      CHECK (payment_threshold_cents >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.fof_settings.payment_policy_enabled IS
  'Off = legacy visit-ahead schedule. Never enable for an org without its own configuration.';
COMMENT ON COLUMN public.fof_settings.payment_strategies IS
  'jsonb: { treatment_class: { atOrAbove: [milestone kinds], below: [milestone kinds] } }. Milestone kinds are stable identities; labels live in payment_milestone_labels.';

-- 2) Payment classification of a procedure ---------------------------------
-- Independent of the INSURANCE category on the same line: a work-up
-- procedure can be a "major" benefit and still be paid at the work-up visit.
ALTER TABLE public.procedure_meta
  ADD COLUMN IF NOT EXISTS treatment_class text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'procedure_meta_treatment_class_check'
  ) THEN
    ALTER TABLE public.procedure_meta
      ADD CONSTRAINT procedure_meta_treatment_class_check
      CHECK (treatment_class IS NULL OR treatment_class IN (
        'work_up','implant_surgical','restorative_lab','denture_partial',
        'other_no_delivery','zero_fee_marker'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.procedure_meta.treatment_class IS
  'Payment classification for the FOF schedule. NULL = fall back to the office work-up code list, then the CDT-range suggestion.';

-- RLS is unchanged: both tables already restrict reads to org members and
-- writes to org admins (owner/manager), scoped by org_id.
