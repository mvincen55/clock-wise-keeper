-- FOF refinements: structured footnote slots with deterministic asterisk
-- markers, and an explicit in-network flag on insurance plans (in-network
-- plans offer no additional prepay discount). De-identified config only.

ALTER TABLE public.fof_templates
  ADD COLUMN footnote_validity text NOT NULL DEFAULT '',
  ADD COLUMN footnote_prepay text NOT NULL DEFAULT '',
  ADD COLUMN footnote_insurance text NOT NULL DEFAULT '',
  ADD COLUMN footnote_contact text NOT NULL DEFAULT '';

-- Move the known footnote paragraphs from the freeform array into their
-- slots (stripping the legacy leading asterisks); leave anything
-- unrecognized in the array as extra unmarked notes.
UPDATE public.fof_templates t SET
  footnote_validity = COALESCE((
    SELECT regexp_replace(e, '^\*+', '') FROM jsonb_array_elements_text(t.footnotes) e
    WHERE e ILIKE '%60 days%' LIMIT 1), ''),
  footnote_prepay = COALESCE((
    SELECT regexp_replace(e, '^\*+', '') FROM jsonb_array_elements_text(t.footnotes) e
    WHERE e ILIKE '%prepay discount%' AND e ILIKE '%honored%' LIMIT 1), ''),
  footnote_insurance = COALESCE((
    SELECT regexp_replace(e, '^\*+', '') FROM jsonb_array_elements_text(t.footnotes) e
    WHERE e ILIKE '%insurance payment%' AND e ILIKE '%estimate%' LIMIT 1), ''),
  footnote_contact = COALESCE((
    SELECT regexp_replace(e, '^\*+', '') FROM jsonb_array_elements_text(t.footnotes) e
    WHERE e ILIKE '%financing company%' OR e ILIKE '%signed copy%' LIMIT 1), '');

UPDATE public.fof_templates t SET footnotes = COALESCE((
  SELECT jsonb_agg(e) FROM jsonb_array_elements_text(t.footnotes) e
  WHERE NOT (
    e ILIKE '%60 days%'
    OR (e ILIKE '%prepay discount%' AND e ILIKE '%honored%')
    OR (e ILIKE '%insurance payment%' AND e ILIKE '%estimate%')
    OR e ILIKE '%financing company%'
    OR e ILIKE '%signed copy%'
  )), '[]'::jsonb);

-- Markers are now rendered automatically; drop legacy stars from labels.
UPDATE public.fof_templates SET discount_label = regexp_replace(discount_label, '[*]+$', '');

ALTER TABLE public.insurance_plans
  ADD COLUMN is_in_network boolean NOT NULL DEFAULT true;
