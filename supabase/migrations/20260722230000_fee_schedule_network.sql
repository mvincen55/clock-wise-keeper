-- Carrier fee schedules gain an in-network marker. The FOF builder applies
-- insurance write-offs automatically whenever the selected schedule is a
-- contracted (in-network) one — no per-form toggle needed.
ALTER TABLE public.fee_schedules
  ADD COLUMN is_in_network boolean NOT NULL DEFAULT false;
