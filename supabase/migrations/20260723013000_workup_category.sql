-- New "workup" fee category: diagnostic work-up procedures (CT scan,
-- diagnostic models). Never insurance-covered and billed at their visit —
-- an all-workup first visit owes nothing upon scheduling.
ALTER TABLE public.fee_schedule_items DROP CONSTRAINT fee_schedule_items_category_check;
ALTER TABLE public.fee_schedule_items
  ADD CONSTRAINT fee_schedule_items_category_check
  CHECK (category IN ('preventive', 'basic', 'major', 'workup', 'other'));

UPDATE public.fee_schedule_items SET category = 'workup'
  WHERE UPPER(code) IN ('D0367', 'D0470');
