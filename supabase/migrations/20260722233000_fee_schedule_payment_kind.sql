-- Plan payment tables (table-of-allowance plans: the set dollar amounts a
-- plan pays per code) become their own schedule kind, so the FOF builder
-- can offer them separately from carrier allowed-fee schedules.
ALTER TABLE public.fee_schedules DROP CONSTRAINT fee_schedules_kind_check;
ALTER TABLE public.fee_schedules
  ADD CONSTRAINT fee_schedules_kind_check CHECK (kind IN ('office', 'carrier', 'payment'));
