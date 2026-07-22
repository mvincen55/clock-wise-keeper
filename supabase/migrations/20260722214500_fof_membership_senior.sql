-- Membership (Illumitrac) and senior-discount configuration on FOF
-- templates, plus plan behavior after the annual max is exhausted. The
-- patient's age is entered at form time (memory only); these columns are
-- de-identified rules.

ALTER TABLE public.fof_templates
  ADD COLUMN membership_discount_percent int NOT NULL DEFAULT 0
    CHECK (membership_discount_percent BETWEEN 0 AND 100),
  ADD COLUMN senior_discount_applies boolean NOT NULL DEFAULT false;

-- Some carriers (Altus, certain Delta Dental plans) stop honoring the
-- negotiated allowed fee once the patient's annual max is used up —
-- remaining charges revert to the office fee schedule with no write-off.
ALTER TABLE public.insurance_plans
  ADD COLUMN office_fees_after_max boolean NOT NULL DEFAULT false;
