-- PENDING — NOT APPLIED. Run only AFTER 20260909213000_fof_payment_policy.sql.
--
-- Harelick Dental's CONFIRMED payment policy — seeded for that organization
-- ONLY (id verified against public.orgs: 852fc8e0-4071-499b-b655-f86d6f789cd5,
-- "HARELICK DENTAL ASSOCIATES, LLC").
--
-- These are Harelick's settings, not Purple Envelope defaults. Every other
-- organization keeps payment_policy_enabled = false and its own configuration;
-- nothing in this file touches another org's rows. Re-running is a no-op.
--
-- Policy, as clarified by the office:
--   * Threshold $1,000, inclusive (exactly $1,000 is the higher tier).
--   * Work-up is its own appointment, paid in full there, and is excluded
--     from later thresholds and balances. D6190 (surgical implant guide) is
--     work-up for this office.
--   * Implant placement/surgical phase: 50% at scheduling, 50% at surgery,
--     at any amount (the office buys parts in advance).
--   * Crown/bridge/implant restoration: thirds at scheduling / prep /
--     delivery at or above $1,000; halves at prep / delivery below.
--   * Denture/partial: thirds at scheduling / first impressions-or-try-in /
--     delivery at or above $1,000; halves at impressions / delivery below.
--   * Other treatment with no delivery phase: halves at scheduling /
--     treatment at or above $1,000; one full payment on treatment day below.
--   * Balancing cents land in the last installment.

DO $$
DECLARE
  v_org uuid := '852fc8e0-4071-499b-b655-f86d6f789cd5';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org) THEN
    RAISE NOTICE 'Harelick org % not present — skipping seed.', v_org;
    RETURN;
  END IF;

  INSERT INTO public.fof_settings (org_id) VALUES (v_org)
  ON CONFLICT (org_id) DO NOTHING;

  UPDATE public.fof_settings SET
    payment_policy_enabled = true,
    payment_threshold_cents = 100000,
    payment_threshold_inclusive = true,
    payment_work_up_codes = ARRAY['D0367','D0470','D6190'],
    payment_implant_advance_exception = true,
    payment_mixed_group_uplift = true,
    payment_combine_mode = 'linked_events',
    payment_rounding = 'last',
    payment_strategies = '{
      "work_up": {"atOrAbove": ["work_up"], "below": ["work_up"]},
      "implant_surgical": {"atOrAbove": ["schedule","surgery"], "below": ["schedule","surgery"]},
      "restorative_lab": {"atOrAbove": ["schedule","prep","delivery"], "below": ["prep","delivery"]},
      "denture_partial": {"atOrAbove": ["schedule","impression_or_tryin","delivery"], "below": ["impression_or_tryin","delivery"]},
      "other_no_delivery": {"atOrAbove": ["schedule","treatment"], "below": ["treatment"]},
      "zero_fee_marker": {"atOrAbove": [], "below": []}
    }'::jsonb,
    payment_milestone_labels = '{
      "work_up": "At the Work-Up Appointment",
      "schedule": "Upon Scheduling",
      "prep": "At the Prep / Impression Appointment",
      "surgery": "At Surgery",
      "impression_or_tryin": "At Impressions or Try-In",
      "treatment": "On the Day of Treatment",
      "delivery": "On Delivery"
    }'::jsonb
  WHERE org_id = v_org;

  -- Payment classifications for this office's own procedure metadata.
  INSERT INTO public.procedure_meta (org_id, code, treatment_class)
  VALUES
    (v_org, 'D0367', 'work_up'),
    (v_org, 'D0470', 'work_up'),
    (v_org, 'D6190', 'work_up')
  ON CONFLICT (org_id, code) DO UPDATE SET treatment_class = EXCLUDED.treatment_class;
END $$;
