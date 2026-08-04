-- Staff initials, auto-stamped into Broken Appointments output blocks
-- (Pop-Up, appointment note, datelines, ledger checklist). Lives on the
-- self-editable profiles row; an explicit value wins over deriving from
-- full_name. Staff configuration only — no patient data, and nothing is
-- stored per-generation (the value is stamped into copy-paste text only).
ALTER TABLE public.profiles ADD COLUMN initials text NOT NULL DEFAULT '';
