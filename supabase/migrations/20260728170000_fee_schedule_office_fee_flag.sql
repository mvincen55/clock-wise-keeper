-- Carrier fee schedules carry rows that are not contracted rates at all.
-- Dentrix prints those with a trailing asterisk — "520.00*" means "no
-- negotiated fee for this code, so this is your own office fee."
--
-- Verified against the office schedule before adding this: every
-- asterisked row in the BCBS export (240) and the Delta Dental export
-- (248) equals the office fee exactly, with no exceptions.
--
-- Such a row must not be stored as a plain allowable. An allowable copied
-- from today's office fee goes stale the moment the office raises that
-- fee, and the FOF would then print a write-off the carrier never agreed
-- to — inflating the insurance estimate and understating what the patient
-- owes. Flagged rows are read as "no contracted rate", so the estimate
-- follows the office fee, exactly as a missing row already does
-- (allowedCents ?? officeFeeCents in src/lib/fof/insurance.ts).

ALTER TABLE public.fee_schedule_items
  ADD COLUMN is_office_fee boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.fee_schedule_items.is_office_fee IS
  'True when this carrier row is the office fee rather than a contracted rate (Dentrix prints these with a trailing asterisk). The FOF reads it as "no allowable" and falls back to the current office fee.';
