\set ON_ERROR_STOP on

DO $$
DECLARE
  v_table text;
  v_oid regclass;
  v_rls boolean;
  v_tables text[] := ARRAY[
    'knowledge_categories',
    'knowledge_items',
    'knowledge_versions',
    'knowledge_blocks',
    'knowledge_evidence',
    'knowledge_reviews',
    'practice_setup_sessions',
    'practice_setup_sources',
    'practice_setup_findings',
    'practice_setup_finding_sources',
    'knowledge_acknowledgments',
    'knowledge_acknowledgment_events',
    'knowledge_acknowledgment_escalation_settings'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    v_oid := to_regclass('public.' || v_table);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Required release table public.% is missing', v_table;
    END IF;

    SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = v_oid;
    IF NOT COALESCE(v_rls, false) THEN
      RAISE EXCEPTION 'RLS is not enabled on public.%', v_table;
    END IF;

    IF has_table_privilege('anon', v_oid, 'SELECT')
       OR has_table_privilege('anon', v_oid, 'INSERT')
       OR has_table_privilege('anon', v_oid, 'UPDATE')
       OR has_table_privilege('anon', v_oid, 'DELETE') THEN
      RAISE EXCEPTION 'anon has direct privileges on public.%', v_table;
    END IF;

    IF has_table_privilege('authenticated', v_oid, 'INSERT')
       OR has_table_privilege('authenticated', v_oid, 'UPDATE')
       OR has_table_privilege('authenticated', v_oid, 'DELETE') THEN
      RAISE EXCEPTION 'authenticated has direct write privileges on public.%', v_table;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_signature text;
  v_oid regprocedure;
  v_private_functions text[] := ARRAY[
    '_recompute_attendance_range_internal(uuid,date,date)',
    'knowledge_record_acknowledgment_event(uuid,text,text,text,uuid,uuid,text,jsonb)',
    'create_knowledge_acknowledgment_assignments(uuid,uuid)',
    'knowledge_user_work_context(uuid,uuid,date)',
    'knowledge_add_working_days(uuid,uuid,timestamptz,integer,time)',
    'knowledge_routine_notice_window(uuid,uuid,timestamptz)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_private_functions LOOP
    v_oid := to_regprocedure('public.' || v_signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Required private function public.% is missing', v_signature;
    END IF;

    IF has_function_privilege('anon', v_oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Private function public.% is executable by an app role', v_signature;
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname = 'acknowledgment-escalation-hourly'
    AND active;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active acknowledgment escalation cron; found %', v_count;
  END IF;
END;
$$;

SELECT 'release database probes passed' AS result;
