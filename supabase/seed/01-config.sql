-- Frozen FOF — configuration seed (org, users, templates, schedules).
-- Data snapshot from the source system; re-exported at gift time.
--
-- HELD VALUE (per the gift-owner's decision): the membership template is
-- named 'In-House Membership (Illumitrac)' — the office's own
-- vocabulary — and KEEPS that name across data regenerations even if
-- the source product's row is named differently.
--
-- BEFORE RUNNING: create the owner's auth user in the Supabase
-- dashboard (Authentication → Users → Add user, email + password),
-- copy their User UID, and replace OWNER_AUTH_USER_ID below.

DO $$
DECLARE
  owner_id uuid := 'OWNER_AUTH_USER_ID';  -- ← replace before running
  org uuid := '852fc8e0-4071-499b-b655-f86d6f789cd5';
BEGIN

INSERT INTO public.orgs (id, name, created_by)
VALUES (org, 'HARELICK DENTAL ASSOCIATES, LLC', owner_id);

INSERT INTO public.org_members (org_id, user_id, role, status)
VALUES (org, owner_id, 'owner', 'active');

INSERT INTO public.allowed_users (email) VALUES
  ('meganvincent43@gmail.com'),
  ('mvincent@drharelick.com')
ON CONFLICT (email) DO NOTHING;

-- The signup trigger creates the profile row when the auth user is
-- created; refresh the name here in case the user pre-dates the schema.
INSERT INTO public.profiles (id, email, full_name)
VALUES (owner_id, 'meganvincent43@gmail.com', 'Megan Vincent')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.employees (org_id, user_id, display_name, email, employment_status, hire_date)
VALUES (org, owner_id, 'Megan Vincent', 'meganvincent43@gmail.com', 'active', '2022-02-07');

INSERT INTO public.fof_settings (org_id, practice_name, address_line1, address_line2, phone, website, doctor_name)
VALUES (org, 'Harelick Dental Associates, LLC', '278 Alden Road', 'Fairhaven, MA 02719',
        '(508) 993-0515', 'drharelick.com', 'Dr. Scott');

INSERT INTO public.fee_schedules (id, org_id, name, kind, is_active, sort_order, is_in_network) VALUES
  ('6408e730-5098-4642-8a43-0ab06da0ffc5', org, 'Office Fee Schedule', 'office', true, 0, false),
  ('c4cb537c-9c5f-467f-8ae7-437bd4906af1', org, 'Delta Dental MA', 'carrier', true, 1, true),
  ('4d2d70e5-ef1f-46f3-925a-6e7cd2efa104', org, 'Blue Cross Blue Shield MA', 'carrier', true, 99, true),
  ('c7fa89c0-2eaa-4b7e-969a-cced9bb7d4d2', org, 'Altus', 'carrier', true, 99, true);

INSERT INTO public.insurance_plans
  (id, org_id, name, fee_schedule_id, preventive_pct, basic_pct, major_pct, deductible_cents,
   deductible_waived_preventive, annual_max_cents, writeoff_applies, is_active, sort_order,
   is_in_network, office_fees_after_max)
VALUES
  ('5073e22c-3655-4960-8472-81a8eee1888d', org, 'DD MA 100/80/50',
   'c4cb537c-9c5f-467f-8ae7-437bd4906af1', 100, 80, 50, 5000, true, 150000, true, true, 0, true, false);

INSERT INTO public.fof_procedure_bundles (org_id, name, codes, sort_order) VALUES
  (org, 'Crown', '["D2740","D2950"]'::jsonb, 0),
  (org, 'Implant', '["D0367","D0470","D5982","D6010","D6011","D6057","D6059"]'::jsonb, 0);

INSERT INTO public.fof_templates
  (org_id, name, sort_order, is_active, discount_percent, discount_label,
   show_insurance_estimate, show_write_off, show_prepay_option, show_installment_option,
   installment_count, installment_labels, footnotes, signature_intro, created_by,
   footnote_validity, footnote_prepay, footnote_insurance, footnote_contact,
   membership_discount_percent, senior_discount_applies)
VALUES
  (org, 'Self-Pay', 0, true, 10, 'Prepay Discount', false, false, true, true, 3,
   '["Visit 1 (Upon scheduling)","Visit 2 (Prep date)","Visit 3 (On delivery)"]'::jsonb,
   '[]'::jsonb,
   'has read this Financial Options Form in its entirety and agrees to the following plan:',
   owner_id,
   'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.',
   'The "Prepay Discount" on this Financial Options Form will be honored if the total amount is paid either at the time of scheduling or at least two weeks prior to the appointment. For appointments scheduled less than two weeks in advance, payment must be made at the time of scheduling to qualify for the discount.',
   '',
   'Questions about this form, or interested in another payment arrangement such as outside financing? Call us at (508) 993-0515 — we''re happy to help. Please mail your signed copy, along with your payment, to Harelick Dental Associates, LLC, 278 Alden Road, Fairhaven, MA 02719.',
   0, true),
  (org, 'In-Network Insurance', 1, true, 0, '', true, true, false, true, 3,
   '["Visit 1 (Upon scheduling)","Visit 2 (Prep date)","Visit 3 (On delivery)"]'::jsonb,
   '[]'::jsonb,
   'has read this Financial Options Form in its entirety and agrees to the following plan:',
   owner_id,
   'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.',
   '',
   'Please note that the calculated insurance payment, including any write-offs, is only an estimate. While we have made every effort to calculate this amount accurately, any insurance underpayment will remain your responsibility. If you believe there has been a change to your insurance coverage, please notify us as soon as possible.',
   'Questions about this form, or interested in another payment arrangement such as outside financing? Call us at (508) 993-0515 — we''re happy to help. Please mail your signed copy, along with your payment, to Harelick Dental Associates, LLC, 278 Alden Road, Fairhaven, MA 02719.',
   0, false),
  (org, 'Out-of-Network Insurance', 2, true, 10, 'Prepay Discount', true, false, true, true, 3,
   '["Visit 1 (Upon scheduling)","Visit 2 (Prep date)","Visit 3 (On delivery)"]'::jsonb,
   '[]'::jsonb,
   'has read this Financial Options Form in its entirety and agrees to the following plan:',
   owner_id,
   'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.',
   'The "Prepay Discount" on this Financial Options Form will be honored if the total amount is paid either at the time of scheduling or at least two weeks prior to the appointment. For appointments scheduled less than two weeks in advance, payment must be made at the time of scheduling to qualify for the discount.',
   'Please note that the calculated insurance payment, including any write-offs, is only an estimate. While we have made every effort to calculate this amount accurately, any insurance underpayment will remain your responsibility. If you believe there has been a change to your insurance coverage, please notify us as soon as possible.',
   'Questions about this form, or interested in another payment arrangement such as outside financing? Call us at (508) 993-0515 — we''re happy to help. Please mail your signed copy, along with your payment, to Harelick Dental Associates, LLC, 278 Alden Road, Fairhaven, MA 02719.',
   0, true),
  (org, 'In-House Membership (Illumitrac)', 3, true, 0, '', false, false, true, true, 3,
   '["Visit 1 (Upon scheduling)","Visit 2 (Prep date)","Visit 3 (On delivery)"]'::jsonb,
   '["Membership pricing per the in-house membership plan; some exclusions may apply."]'::jsonb,
   'has read this Financial Options Form in its entirety and agrees to the following plan:',
   owner_id,
   'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.',
   '', '',
   'Questions about this form, or interested in another payment arrangement such as outside financing? Call us at (508) 993-0515 — we''re happy to help. Please mail your signed copy, along with your payment, to Harelick Dental Associates, LLC, 278 Alden Road, Fairhaven, MA 02719.',
   10, true),
  (org, 'Financing', 4, true, 0, '', true, false, false, true, 3,
   '["Visit 1 (Upon scheduling)","Visit 2 (Prep date)","Visit 3 (On delivery)"]'::jsonb,
   '["No prepay discount applies when payment is made through an outside financing company."]'::jsonb,
   'has read this Financial Options Form in its entirety and agrees to the following plan:',
   owner_id,
   'The "Total Charges" on this Financial Options Form will remain valid and honored for 60 days from the date listed above.',
   '',
   'Please note that the calculated insurance payment, including any write-offs, is only an estimate. While we have made every effort to calculate this amount accurately, any insurance underpayment will remain your responsibility. If you believe there has been a change to your insurance coverage, please notify us as soon as possible.',
   'Questions about this form, or interested in another payment arrangement such as outside financing? Call us at (508) 993-0515 — we''re happy to help. Please mail your signed copy, along with your payment, to Harelick Dental Associates, LLC, 278 Alden Road, Fairhaven, MA 02719.',
   0, false);

END $$;
