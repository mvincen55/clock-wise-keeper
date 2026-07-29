-- Altus's codes could never match anything.
--
-- The schedule was imported from a spreadsheet whose code column was
-- NUMERIC, and a number column eats everything that is not a digit: CDT
-- D0120 was stored as '120', D7140 as '7140'. The FOF resolves a carrier
-- allowable by exact code string, so of 693 Altus codes only 10 ever
-- matched the office schedule — and those 10 were false collisions with
-- the office's own custom numeric codes, applying one procedure's
-- allowable to a different procedure entirely:
--
--   Altus 9110 "Palliative treatment" $118  vs  office 9110 "HIPAA Ack"
--   Altus 6011 "Surgical access to implant" vs  office 6011 "FOF"
--   Altus 9410 "House/facility call"        vs  office 9410 "10u"
--
-- The other 683 resolved to nothing, so every Altus line fell back to the
-- office fee with a zero write-off — for an IN-NETWORK carrier. Altus
-- patients were quoted the full office fee.
--
-- Every code on a carrier's CDT fee schedule is a CDT code, so give them
-- back the form the rest of the app speaks. Checked before running:
-- all 693 codes are 1-4 digit numerics, and the transform collides with
-- nothing. Result: 10 matchable codes becomes 677.

UPDATE public.fee_schedule_items i
SET code = 'D' || lpad(i.code, 4, '0')
FROM public.fee_schedules s
WHERE s.id = i.schedule_id
  AND s.name = 'Altus'
  AND s.kind = 'carrier'
  AND i.code ~ '^[0-9]{1,4}$';
