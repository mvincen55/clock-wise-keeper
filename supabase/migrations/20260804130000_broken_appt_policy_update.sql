-- Broken Appointments policy update — the ladder is now driven by ledger
-- letter codes (0001–0005), with a transition rule anchored to the date
-- the policy took effect, and card-state snippets that swap into letters.
-- Still DE-IDENTIFIED CONFIGURATION ONLY: no patient data is persisted
-- anywhere in this module (see 20260803210000_broken_appointments.sql).

-- Broken appointments before this date never count toward the ladder —
-- they only set the entry point (first post-policy break lands at Rung 2).
ALTER TABLE public.broken_appt_settings
  ADD COLUMN policy_effective_date date;

-- Card-state snippets (txn_charged / txn_posted / txn_posted_card_failed /
-- card_needed / card_have) are org-editable template rows like letters and
-- replies. The draft-era letter codes (9101A/9101B/9100A/9106/9107) were
-- replaced 1:1 by 0001–0005 client-side; no letters were ever issued under
-- them, so no data migration is needed here.
ALTER TABLE public.broken_appt_templates
  DROP CONSTRAINT broken_appt_templates_kind_check;
ALTER TABLE public.broken_appt_templates
  ADD CONSTRAINT broken_appt_templates_kind_check
  CHECK (kind IN ('letter', 'reply', 'snippet'));
