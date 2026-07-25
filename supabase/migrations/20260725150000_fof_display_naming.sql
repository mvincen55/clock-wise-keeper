-- Genericization: the feature's names become org wording settings.
-- Display-only — routes, tables, code identifiers, and edge functions
-- keep their fixed names; labels are settings.

ALTER TABLE public.fof_settings
  -- Drives the nav label, page headers, and UI strings.
  ADD COLUMN feature_display_name text NOT NULL DEFAULT 'Treatment Estimator',
  -- Names the form wherever the PRINTED document refers to itself; its
  -- initials make the compact office-copy strings ("FOF Detail").
  ADD COLUMN print_form_title text NOT NULL DEFAULT 'Treatment Estimate';

-- The original office keeps its own vocabulary (applied as live data,
-- mirrored here so a rebuilt environment matches production):
UPDATE public.fof_settings
SET feature_display_name = 'Financial Options Form',
    print_form_title = 'Financial Options Form'
WHERE feature_display_name = 'Treatment Estimator';
