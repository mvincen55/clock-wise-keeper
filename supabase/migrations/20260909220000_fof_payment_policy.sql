-- Code-only migration: do not apply as part of building the application.
-- Existing org/member/owner/manager RLS remains the security boundary.
ALTER TABLE public.fof_settings ADD COLUMN IF NOT EXISTS payment_policy jsonb;
ALTER TABLE public.procedure_meta ADD COLUMN IF NOT EXISTS payment_class text;
ALTER TABLE public.procedure_meta ADD CONSTRAINT procedure_payment_class_valid
  CHECK (payment_class IS NULL OR payment_class IN ('review','workup','implant','restoration','denture','other'));

CREATE OR REPLACE FUNCTION public.valid_fof_payment_policy(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE c text; t text; k text; step jsonb; steps jsonb;
BEGIN
  IF p IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p) <> 'object' OR p->>'version' IS DISTINCT FROM '1'
    OR jsonb_typeof(p->'thresholdCents') IS DISTINCT FROM 'number'
    OR (p->>'thresholdCents')::numeric NOT BETWEEN 0 AND 100000000
    OR trunc((p->>'thresholdCents')::numeric) <> (p->>'thresholdCents')::numeric
    OR jsonb_typeof(p->'inclusive') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p->'implantAdvance') IS DISTINCT FROM 'boolean'
    OR p->>'rounding' IS NULL OR p->>'rounding' NOT IN ('nearestLast','floorLast')
    OR p->>'mixedThreshold' IS NULL OR p->>'mixedThreshold' NOT IN ('explicitArrangement','separateGroups')
    OR jsonb_typeof(p->'strategies') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p->'labels') IS DISTINCT FROM 'object'
  THEN RETURN false; END IF;
  FOREACH c IN ARRAY ARRAY['workup','implant','restoration','denture','other'] LOOP
    FOREACH t IN ARRAY ARRAY['below','above'] LOOP
      steps := p->'strategies'->c->t;
      IF jsonb_typeof(steps) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
      IF jsonb_array_length(steps) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
      FOR step IN SELECT value FROM jsonb_array_elements(steps) LOOP
        IF step->>'at' IS NULL OR step->>'at' NOT IN ('booking','workup','surgery','prep','impressions','tryin','delivery','treatment','firstImpressionsOrTryin')
          OR jsonb_typeof(step->'weight') IS DISTINCT FROM 'number'
          OR (step->>'weight')::numeric NOT BETWEEN 1 AND 10000
          OR trunc((step->>'weight')::numeric) <> (step->>'weight')::numeric
        THEN RETURN false; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['booking','workup','surgery','prep','impressions','tryin','delivery','treatment'] LOOP
    IF jsonb_typeof(p->'labels'->k) IS DISTINCT FROM 'string' OR length(trim(p->'labels'->>k)) NOT BETWEEN 1 AND 160 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
ALTER TABLE public.fof_settings ADD CONSTRAINT fof_payment_policy_valid CHECK (public.valid_fof_payment_policy(payment_policy));

-- Verification: org ID resolved through authorized orgs read on 2026-09-09.
-- Targeted seed is separate from the structural migration for review.
