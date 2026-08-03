ALTER TABLE public.org_deposit_settings
  ADD COLUMN IF NOT EXISTS membership_row_label TEXT NOT NULL DEFAULT 'Membership',
  ADD COLUMN IF NOT EXISTS outside_financing_label TEXT NOT NULL DEFAULT 'Outside Financing';

ALTER TABLE public.org_messaging_settings
  ADD COLUMN IF NOT EXISTS doctor_recipient_label TEXT NOT NULL DEFAULT 'the doctor';

-- Existing rows keep their current effective labels so the live office is unchanged.
UPDATE public.org_deposit_settings
SET membership_row_label = 'Illumitrac',
    outside_financing_label = 'Outside Financing'
WHERE membership_row_label = 'Membership';

UPDATE public.org_messaging_settings
SET doctor_recipient_label = 'the doctor'
WHERE doctor_recipient_label = 'the doctor';