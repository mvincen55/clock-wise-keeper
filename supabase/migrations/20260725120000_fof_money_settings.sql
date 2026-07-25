-- Genericization Phase 2a: money thresholds become org settings.
--
-- Three values that shape dollar output move from code constants to
-- org-scoped fof_settings columns. Shipped defaults are the original
-- office's proven values, so existing and new orgs start from the same
-- behavior the code always had. Bounds are enforced server-side with
-- CHECK constraints — these settings move money, so they are never
-- free-form.

ALTER TABLE public.fof_settings
  -- Patient portions under this are simply paid at the visit; nothing is
  -- due before the first visit. Default $1,000, bounded $0–$5,000.
  ADD COLUMN day_of_service_threshold_cents integer NOT NULL DEFAULT 100000
    CHECK (day_of_service_threshold_cents BETWEEN 0 AND 500000),
  -- Payments smaller than this never stand alone in a schedule; they
  -- fold into the previous payment. Default $100, bounded $0–$1,000.
  ADD COLUMN min_standalone_payment_cents integer NOT NULL DEFAULT 10000
    CHECK (min_standalone_payment_cents BETWEEN 0 AND 100000),
  -- Whether the alternate-benefit downgrade toggle starts ON for
  -- downgrade-mapped codes (D2391–D2394). Default off: most plans pay
  -- composite rates; staff enable per line for plans like Altus.
  ADD COLUMN downgrade_default_on boolean NOT NULL DEFAULT false;
