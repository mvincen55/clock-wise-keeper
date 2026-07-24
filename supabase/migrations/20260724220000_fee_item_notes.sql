-- Per-procedure wording & policy notes on fee schedule items. Team-visible
-- office configuration (no patient data) that the AI follows: the FOF's
-- wording passes (name-visits, fof-assistant) and Ask AI (ask-docs) all
-- read the office schedule's notes as authoritative guidance.
ALTER TABLE public.fee_schedule_items
  ADD COLUMN notes text NOT NULL DEFAULT '';
