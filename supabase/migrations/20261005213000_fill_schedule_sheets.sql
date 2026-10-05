-- Q4 paper reports reuse the campaign ledger and its approved rates. Images
-- and OCR text stay on the device. Only validated IDs, times, booleans and
-- confidence numbers reach these RPCs. Automatic posting starts disabled.
ALTER TABLE public.fts_campaigns
  ADD COLUMN auto_import_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN scan_validation jsonb;

CREATE TABLE public.fts_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE, sheet_code text NOT NULL,
  week_key date NOT NULL, row_count int NOT NULL DEFAULT 12 CHECK (row_count=12),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','void')),
  printed_by uuid NOT NULL, printed_at timestamptz NOT NULL DEFAULT now(), print_request_key uuid NOT NULL,
  UNIQUE(campaign_id,sheet_code), UNIQUE(campaign_id,print_request_key)
);
ALTER TABLE public.fts_activities
  ADD COLUMN source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','sheet','manager')),
  ADD COLUMN sheet_id uuid REFERENCES public.fts_sheets(id), ADD COLUMN sheet_row int CHECK(sheet_row BETWEEN 1 AND 12),
  ADD COLUMN sheet_code text, ADD COLUMN booked_by_employee_id uuid REFERENCES public.employees(id),
  ADD COLUMN supersedes_id uuid REFERENCES public.fts_activities(id),
  ADD CONSTRAINT fts_sheet_pair CHECK ((sheet_id IS NULL)=(sheet_row IS NULL) AND (sheet_id IS NULL)=(sheet_code IS NULL)),
  ADD CONSTRAINT fts_booked_by_kind CHECK (booked_by_employee_id IS NULL OR activity_type='operative_handoff');
CREATE UNIQUE INDEX fts_sheet_live_component ON public.fts_activities(sheet_id,sheet_row,activity_type)
  WHERE sheet_id IS NOT NULL AND status IN ('pending','approved');

CREATE TABLE public.fts_sheet_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE, sheet_id uuid NOT NULL REFERENCES public.fts_sheets(id),
  uploaded_by uuid NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(), reader text NOT NULL CHECK(reader='local:tesseract-7'),
  summary jsonb NOT NULL DEFAULT '{}', image_deleted_at timestamptz NOT NULL, request_key uuid NOT NULL,
  UNIQUE(campaign_id,request_key)
);
CREATE TABLE public.fts_sheet_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE, sheet_id uuid NOT NULL REFERENCES public.fts_sheets(id),
  row_no int NOT NULL CHECK(row_no BETWEEN 1 AND 12), last_scan_id uuid NOT NULL REFERENCES public.fts_sheet_scans(id),
  reading jsonb NOT NULL, accepted_reading jsonb, previous_reading jsonb,
  credit_employee_id uuid REFERENCES public.employees(id), booked_by_employee_id uuid REFERENCES public.employees(id),
  handoff_state text NOT NULL DEFAULT 'blank' CHECK(handoff_state IN ('blank','entered','awaiting','flagged','linked','skipped')),
  prepay_state text NOT NULL DEFAULT 'none' CHECK(prepay_state IN ('none','entered','not_verified','flagged','skipped')),
  flags text[] NOT NULL DEFAULT '{}', handoff_activity_id uuid REFERENCES public.fts_activities(id),
  prepay_activity_id uuid REFERENCES public.fts_activities(id), generation int NOT NULL DEFAULT 0 CHECK(generation>=0),
  resolved_by uuid, resolved_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(sheet_id,row_no)
);
CREATE TABLE public.fts_weekly_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.fts_campaigns(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE, week_key date NOT NULL,
  check_key text NOT NULL CHECK(check_key IN ('huddles','reviews')), checked boolean NOT NULL,
  checked_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id,week_key,check_key)
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['fts_sheets','fts_sheet_scans','fts_sheet_rows','fts_weekly_checks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY "Campaign manager read" ON public.%I FOR SELECT TO authenticated USING (public.is_allowed_user() AND public.is_org_admin(org_id))',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fts_roster_names(p_campaign_id uuid)
RETURNS TABLE(id uuid,display_name text,employment_status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; BEGIN
  a:=public.fts_actor(p_campaign_id);
  RETURN QUERY SELECT e.id,e.display_name,e.employment_status::text FROM public.employees e
    JOIN public.fts_participants p ON p.employee_id=e.id AND p.campaign_id=p_campaign_id AND p.active
    WHERE e.org_id=(a.camp).org_id AND e.employment_status='active' ORDER BY e.display_name;
END $$;

CREATE OR REPLACE FUNCTION public.fts_print_sheet(p_campaign_id uuid,p_week_key date,p_request_key uuid DEFAULT gen_random_uuid())
RETURNS public.fts_sheets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; s public.fts_sheets; n int; suffix text:=''; BEGIN
  a:=public.fts_actor(p_campaign_id); IF NOT a.is_admin THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
  PERFORM public.fts_require_week(a.camp,p_week_key);
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Missing request key' USING ERRCODE='22023'; END IF;
  SELECT * INTO s FROM public.fts_sheets WHERE campaign_id=p_campaign_id AND print_request_key=p_request_key;
  IF s.id IS NOT NULL THEN
    IF s.week_key IS DISTINCT FROM p_week_key THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE='23505'; END IF;
    RETURN s;
  END IF;
  SELECT count(*)+1 INTO n FROM public.fts_sheets WHERE campaign_id=p_campaign_id AND week_key=p_week_key;
  WHILE n>0 LOOP n:=n-1; suffix:=chr(65+n%26)||suffix; n:=n/26; END LOOP;
  INSERT INTO public.fts_sheets(campaign_id,org_id,sheet_code,week_key,printed_by,print_request_key)
    VALUES(p_campaign_id,(a.camp).org_id,'S-'||to_char(p_week_key,'MMDD')||'-'||suffix,p_week_key,auth.uid(),p_request_key) RETURNING * INTO s;
  PERFORM public.fts_log(a.camp,'sheet',s.id,NULL,'printed',NULL,to_jsonb(s)); RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.fts_void_sheet(p_sheet_id uuid)
RETURNS public.fts_sheets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.fts_sheets; a record; before jsonb; BEGIN
  SELECT * INTO s FROM public.fts_sheets WHERE id=p_sheet_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Sheet not found' USING ERRCODE='P0002'; END IF;
  a:=public.fts_actor(s.campaign_id); IF NOT a.is_admin THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.fts_activities WHERE sheet_id=s.id) THEN RAISE EXCEPTION 'This sheet already has entries' USING ERRCODE='22023'; END IF;
  before:=to_jsonb(s); UPDATE public.fts_sheets SET status='void' WHERE id=s.id RETURNING * INTO s;
  PERFORM public.fts_log(a.camp,'sheet',s.id,NULL,'voided',before,to_jsonb(s)); RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.fts_set_weekly_check(p_campaign_id uuid,p_week_key date,p_key text,p_checked boolean)
RETURNS public.fts_weekly_checks LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; r public.fts_weekly_checks; before jsonb; BEGIN
  a:=public.fts_actor(p_campaign_id); IF NOT a.is_admin THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
  PERFORM public.fts_require_week(a.camp,p_week_key);
  IF p_key IS NULL OR p_key NOT IN ('huddles','reviews') OR p_checked IS NULL THEN RAISE EXCEPTION 'Choose a check' USING ERRCODE='22023'; END IF;
  SELECT to_jsonb(x) INTO before FROM public.fts_weekly_checks x WHERE campaign_id=p_campaign_id AND week_key=p_week_key AND check_key=p_key;
  INSERT INTO public.fts_weekly_checks(campaign_id,org_id,week_key,check_key,checked,checked_by)
    VALUES(p_campaign_id,(a.camp).org_id,p_week_key,p_key,p_checked,auth.uid())
    ON CONFLICT(campaign_id,week_key,check_key) DO UPDATE SET checked=EXCLUDED.checked,checked_by=EXCLUDED.checked_by,updated_at=now() RETURNING * INTO r;
  PERFORM public.fts_log(a.camp,'weekly_check',r.id,NULL,'checked',before,to_jsonb(r)); RETURN r;
END $$;

-- Validation is an explicit manager-recorded result, never an OCR assertion.
CREATE OR REPLACE FUNCTION public.fts_validate_reader(p_campaign_id uuid,p_rows int,p_staff int,p_accuracy numeric,p_wrong_person int,p_false_verified int)
RETURNS public.fts_campaigns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; c public.fts_campaigns; BEGIN
  a:=public.fts_actor(p_campaign_id); IF NOT a.is_admin THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
  IF p_rows IS NULL OR p_staff IS NULL OR p_accuracy IS NULL OR p_wrong_person IS NULL OR p_false_verified IS NULL
    OR p_rows<30 OR p_staff<3 OR p_accuracy<.95 OR p_accuracy>1 OR p_wrong_person<>0 OR p_false_verified<>0 THEN
    RAISE EXCEPTION 'The real-form handwriting validation has not passed' USING ERRCODE='22023'; END IF;
  UPDATE public.fts_campaigns SET scan_validation=jsonb_build_object('rows',p_rows,'staff',p_staff,'accuracy',p_accuracy,'wrong_person',p_wrong_person,'false_verified',p_false_verified)
    WHERE id=p_campaign_id RETURNING * INTO c;
  PERFORM public.fts_log(a.camp,'campaign',c.id,NULL,'reader_validated',to_jsonb(a.camp),to_jsonb(c)); RETURN c;
END $$;
CREATE OR REPLACE FUNCTION public.fts_set_auto_import(p_campaign_id uuid,p_enabled boolean)
RETURNS public.fts_campaigns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; c public.fts_campaigns; BEGIN
  a:=public.fts_actor(p_campaign_id); IF NOT a.is_admin THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
  IF p_enabled IS NULL OR (p_enabled AND (a.camp).scan_validation IS NULL) THEN RAISE EXCEPTION 'Validate the handwriting reader before enabling automatic entry' USING ERRCODE='22023'; END IF;
  UPDATE public.fts_campaigns SET auto_import_enabled=p_enabled WHERE id=p_campaign_id RETURNING * INTO c;
  PERFORM public.fts_log(a.camp,'campaign',c.id,NULL,'auto_import_changed',to_jsonb(a.camp),to_jsonb(c)); RETURN c;
END $$;

-- Reject unknown keys and all arbitrary strings before storing or auditing.
CREATE OR REPLACE FUNCTION public.fts_clean_sheet_reading(r jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE k text; v jsonb; allowed text[]:=ARRAY['row_no','blank','occurred_at','credit_employee_id','booked_by_employee_id','staff_confirmed','handoff_verified','prepay_yes','prepay_at','prepay_verified','app_code','crossed_out','confidence']; BEGIN
  IF r IS NULL OR jsonb_typeof(r)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) x WHERE NOT(x=ANY(allowed))) THEN RAISE EXCEPTION 'Unsupported sheet fields' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(r->'row_no') IS DISTINCT FROM 'number' OR (r->>'row_no') !~ '^(?:[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Invalid row number' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['blank','staff_confirmed','handoff_verified','prepay_yes','prepay_verified','crossed_out'] LOOP
    IF r?k AND jsonb_typeof(r->k) NOT IN ('boolean','null') THEN RAISE EXCEPTION 'Invalid check mark' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['credit_employee_id','booked_by_employee_id'] LOOP
    IF r->>k IS NOT NULL AND (jsonb_typeof(r->k)<>'string' OR r->>k !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') THEN RAISE EXCEPTION 'Invalid employee reference' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['occurred_at','prepay_at'] LOOP
    IF r->>k IS NOT NULL THEN
      IF jsonb_typeof(r->k)<>'string' OR r->>k !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' THEN RAISE EXCEPTION 'Invalid form time' USING ERRCODE='22023'; END IF;
      BEGIN PERFORM (r->>k)::timestamptz; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Invalid form time' USING ERRCODE='22023'; END;
    END IF;
  END LOOP;
  IF r->>'app_code' IS NOT NULL AND (jsonb_typeof(r->'app_code')<>'string' OR r->>'app_code' !~ '^[A-Z0-9]{8}$') THEN RAISE EXCEPTION 'Invalid app reference' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(r->'confidence') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing field confidence' USING ERRCODE='22023'; END IF;
  FOR k,v IN SELECT * FROM jsonb_each(r->'confidence') LOOP
    IF k NOT IN ('occurred_at','credit','booked_by','staff','handoff_verified','prepay_yes','prepay_at','prepay_verified','app_code','crossed_out') OR jsonb_typeof(v)<>'number' OR v::numeric<0 OR v::numeric>1 THEN RAISE EXCEPTION 'Invalid confidence' USING ERRCODE='22023'; END IF;
  END LOOP;
  RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.fts_sheet_signature(r jsonb,p_component text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN p_component='handoff' THEN jsonb_build_array(r->'occurred_at',r->'credit_employee_id',r->'booked_by_employee_id',r->'staff_confirmed')
 ELSE jsonb_build_array(r->'prepay_at',r->'prepay_yes') END;
$$;
CREATE OR REPLACE FUNCTION public.fts_component_key(p_sheet uuid,p_row int,p_component text,p_generation int DEFAULT 0)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT md5(p_sheet::text||':'||p_row||':'||p_component||':'||p_generation)::uuid;
$$;

-- Sync externally verified/reversed ledger rows. A reversed component stays
-- skipped and cannot silently reappear when the same sheet is scanned again.
CREATE OR REPLACE FUNCTION public.fts_sync_sheet_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.activity_type='operative_handoff' THEN
    UPDATE public.fts_sheet_rows SET handoff_state=CASE WHEN NEW.status='approved' THEN CASE WHEN handoff_state='linked' THEN 'linked' ELSE 'entered' END WHEN NEW.status='pending' THEN 'awaiting' ELSE 'skipped' END,updated_at=now()
      WHERE handoff_activity_id=NEW.id;
  ELSIF NEW.activity_type='prepay_bonus' THEN
    UPDATE public.fts_sheet_rows SET prepay_state=CASE WHEN NEW.status='approved' THEN 'entered' ELSE 'skipped' END,updated_at=now() WHERE prepay_activity_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fts_sync_sheet_activity AFTER UPDATE OF status ON public.fts_activities FOR EACH ROW EXECUTE FUNCTION public.fts_sync_sheet_activity();
CREATE OR REPLACE FUNCTION public.fts_set_activity_origin()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
  IF NEW.activity_type IN ('google_review','attend_bonus','prepay_bonus') THEN NEW.source:='manager'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fts_set_activity_origin() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fts_set_activity_origin BEFORE INSERT ON public.fts_activities FOR EACH ROW EXECUTE FUNCTION public.fts_set_activity_origin();

-- Evaluate only the prepayment component; a problem here never undoes an
-- approved handoff. The existing bonus RPC enforces rates, linkage and dates.
CREATE OR REPLACE FUNCTION public.fts_apply_sheet_prepay(p_row_id uuid,p_manual boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.fts_sheet_rows; h public.fts_activities; b public.fts_activities; s public.fts_sheets; c public.fts_campaigns; v jsonb; ts timestamptz; BEGIN
  SELECT * INTO r FROM public.fts_sheet_rows WHERE id=p_row_id; v:=r.reading;
  SELECT * INTO h FROM public.fts_activities WHERE id=r.handoff_activity_id;
  SELECT * INTO s FROM public.fts_sheets WHERE id=r.sheet_id;
  SELECT * INTO c FROM public.fts_campaigns WHERE id=r.campaign_id;
  IF h.id IS NULL OR h.status<>'approved' OR r.prepay_state='skipped' THEN RETURN; END IF;
  IF NOT p_manual AND NOT c.auto_import_enabled THEN RETURN; END IF;
  SELECT * INTO b FROM public.fts_activities WHERE parent_id=h.id AND activity_type='prepay_bonus' AND status='approved';
  IF b.id IS NOT NULL THEN
    IF r.prepay_activity_id IS NOT NULL AND public.fts_sheet_signature(v,'prepay') IS DISTINCT FROM public.fts_sheet_signature(r.accepted_reading,'prepay') THEN
      UPDATE public.fts_sheet_rows SET prepay_state='flagged',flags=array_append(array_remove(flags,'prepay_changed'),'prepay_changed') WHERE id=r.id; RETURN;
    END IF;
    UPDATE public.fts_sheet_rows SET prepay_activity_id=b.id,prepay_state='entered' WHERE id=r.id; RETURN;
  END IF;
  IF (v->>'prepay_yes')::boolean IS FALSE AND COALESCE((v->'confidence'->>'prepay_yes')::numeric,0)>=.85 THEN
    UPDATE public.fts_sheet_rows SET prepay_state='none' WHERE id=r.id; RETURN;
  END IF;
  IF (v->>'prepay_yes')::boolean IS NULL OR COALESCE((v->'confidence'->>'prepay_yes')::numeric,0)<.85 THEN
    UPDATE public.fts_sheet_rows SET prepay_state='flagged',flags=array_append(flags,'prepay_unreadable') WHERE id=r.id; RETURN;
  END IF;
  IF NOT COALESCE((v->>'prepay_verified')::boolean,false) OR COALESCE((v->'confidence'->>'prepay_verified')::numeric,0)<.85 THEN
    UPDATE public.fts_sheet_rows SET prepay_state='not_verified' WHERE id=r.id; RETURN;
  END IF;
  IF v->>'prepay_at' IS NULL OR COALESCE((v->'confidence'->>'prepay_at')::numeric,0)<.85 THEN
    UPDATE public.fts_sheet_rows SET prepay_state='flagged',flags=array_append(flags,'prepay_unclear') WHERE id=r.id; RETURN;
  END IF;
  ts:=(v->>'prepay_at')::timestamptz;
  IF ts<h.occurred_at OR ts>now()+interval '2 minutes' OR ts<(c.starts_on::timestamp AT TIME ZONE c.timezone) OR ts>=((c.ends_on+1)::timestamp AT TIME ZONE c.timezone) THEN
    UPDATE public.fts_sheet_rows SET prepay_state='flagged',flags=array_append(flags,'prepay_invalid_time') WHERE id=r.id; RETURN;
  END IF;
  b:=public.fts_award_bonus(h.id,'prepay_bonus',ts,public.fts_component_key(s.id,r.row_no,'prepay',r.generation));
  UPDATE public.fts_activities SET source='sheet',sheet_id=s.id,sheet_row=r.row_no,sheet_code=s.sheet_code WHERE id=b.id;
  UPDATE public.fts_sheet_rows SET prepay_activity_id=b.id,prepay_state='entered',accepted_reading=v WHERE id=r.id;
END $$;

CREATE OR REPLACE FUNCTION public.fts_apply_sheet_row(p_row_id uuid,p_manual boolean DEFAULT false,p_link_id uuid DEFAULT NULL)
RETURNS public.fts_sheet_rows LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.fts_sheet_rows; h public.fts_activities; s public.fts_sheets; c public.fts_campaigns; v jsonb; ts timestamptz; person uuid; booked uuid; flag text; BEGIN
  SELECT * INTO r FROM public.fts_sheet_rows WHERE id=p_row_id FOR UPDATE; v:=r.reading;
  SELECT * INTO s FROM public.fts_sheets WHERE id=r.sheet_id; SELECT * INTO c FROM public.fts_campaigns WHERE id=r.campaign_id;
  IF r.handoff_state='skipped' THEN RETURN r; END IF;
  IF r.handoff_activity_id IS NOT NULL THEN
    SELECT * INTO h FROM public.fts_activities WHERE id=r.handoff_activity_id;
    IF public.fts_sheet_signature(v,'handoff') IS DISTINCT FROM public.fts_sheet_signature(r.accepted_reading,'handoff') THEN flag:='row_changed';
    ELSIF h.status NOT IN ('pending','approved') THEN UPDATE public.fts_sheet_rows SET handoff_state='skipped' WHERE id=r.id;
    ELSE
      IF h.status='pending' AND (p_manual OR c.auto_import_enabled) AND COALESCE((v->>'handoff_verified')::boolean,false) AND COALESCE((v->'confidence'->>'handoff_verified')::numeric,0)>=.85 THEN h:=public.fts_verify(h.id,true); END IF;
      UPDATE public.fts_sheet_rows SET handoff_state=CASE WHEN h.status='pending' THEN 'awaiting' WHEN r.handoff_state='linked' THEN 'linked' ELSE 'entered' END,flags='{}' WHERE id=r.id;
      PERFORM public.fts_apply_sheet_prepay(r.id,p_manual);
    END IF;
    IF flag IS NOT NULL THEN UPDATE public.fts_sheet_rows SET handoff_state='flagged',flags=ARRAY[flag] WHERE id=r.id; END IF;
    SELECT * INTO r FROM public.fts_sheet_rows WHERE id=r.id; RETURN r;
  END IF;
  IF COALESCE((v->>'blank')::boolean,false) THEN RETURN r; END IF;
  person:=(v->>'credit_employee_id')::uuid; booked:=(v->>'booked_by_employee_id')::uuid;
  IF person IS NOT NULL THEN PERFORM public.fts_require_participant(c,person); END IF;
  IF COALESCE((v->>'crossed_out')::boolean,false) AND NOT p_manual THEN flag:='crossed_out';
  ELSIF person IS NULL THEN flag:='name_needed';
  ELSIF v->>'occurred_at' IS NULL OR (NOT p_manual AND (COALESCE((v->'confidence'->>'occurred_at')::numeric,0)<.85 OR COALESCE((v->'confidence'->>'credit')::numeric,0)<.85 OR COALESCE((v->'confidence'->>'staff')::numeric,0)<.85)) THEN flag:='unreadable';
  ELSIF NOT COALESCE((v->>'staff_confirmed')::boolean,false) AND NOT p_manual THEN flag:='not_confirmed_by_staff';
  ELSE
    PERFORM public.fts_require_participant(c,person); ts:=(v->>'occurred_at')::timestamptz;
    IF ts>now()+interval '2 minutes' OR ts<(c.starts_on::timestamp AT TIME ZONE c.timezone) OR ts>=((c.ends_on+1)::timestamp AT TIME ZONE c.timezone) THEN flag:='outside_campaign';
    ELSIF public.fts_week_key(ts,c.timezone,c.ends_on)<>s.week_key AND NOT p_manual THEN flag:='wrong_sheet_week'; END IF;
  END IF;
  IF flag IS NULL AND booked IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.fts_participants p JOIN public.employees e ON e.id=p.employee_id WHERE p.campaign_id=c.id AND p.employee_id=booked AND p.active AND e.org_id=c.org_id AND e.employment_status='active') THEN booked:=NULL; END IF;
  END IF;
  IF flag IS NULL THEN
    IF p_link_id IS NOT NULL OR v->>'app_code' IS NOT NULL THEN
      SELECT * INTO h FROM public.fts_activities WHERE campaign_id=c.id AND (CASE WHEN p_link_id IS NOT NULL THEN id=p_link_id ELSE entry_code=v->>'app_code' END);
      IF h.id IS NULL OR h.employee_id<>person OR h.activity_type<>'operative_handoff' OR h.status NOT IN ('pending','approved') THEN flag:='code_not_found';
      ELSIF (h.sheet_id IS NOT NULL AND (h.sheet_id<>s.id OR h.sheet_row<>r.row_no)) THEN flag:='already_linked_elsewhere';
      ELSIF h.occurred_at<>ts AND NOT p_manual THEN flag:='code_time_mismatch'; END IF;
    ELSIF NOT p_manual AND COALESCE((v->'confidence'->>'app_code')::numeric,1)<.85 THEN flag:='code_not_found';
    ELSIF NOT p_manual AND EXISTS(SELECT 1 FROM public.fts_activities WHERE campaign_id=c.id AND employee_id=person AND activity_type='operative_handoff' AND status IN ('pending','approved') AND (occurred_at AT TIME ZONE c.timezone)::date=(ts AT TIME ZONE c.timezone)::date) THEN flag:='possible_duplicate'; END IF;
  END IF;
  IF flag IS NULL AND NOT p_manual AND NOT c.auto_import_enabled THEN flag:='auto_import_off'; END IF;
  IF flag IS NOT NULL THEN
    UPDATE public.fts_sheet_rows SET handoff_state='flagged',flags=ARRAY[flag],credit_employee_id=person,booked_by_employee_id=booked WHERE id=r.id;
  ELSE
    IF h.id IS NULL THEN h:=public.fts_record_for(c.id,person,'operative_handoff',ts,1,public.fts_component_key(s.id,r.row_no,'handoff',r.generation),booked); END IF;
    UPDATE public.fts_activities SET source=CASE WHEN h.request_key=public.fts_component_key(s.id,r.row_no,'handoff',r.generation) THEN 'sheet' ELSE source END,
      sheet_id=s.id,sheet_row=r.row_no,sheet_code=s.sheet_code,booked_by_employee_id=COALESCE(booked,booked_by_employee_id) WHERE id=h.id;
    IF h.status='pending' AND COALESCE((v->>'handoff_verified')::boolean,false) AND COALESCE((v->'confidence'->>'handoff_verified')::numeric,0)>=.85 THEN h:=public.fts_verify(h.id,true); END IF;
    UPDATE public.fts_sheet_rows SET handoff_activity_id=h.id,credit_employee_id=person,booked_by_employee_id=booked,accepted_reading=v,
      handoff_state=CASE WHEN h.status='pending' THEN 'awaiting' WHEN h.request_key=public.fts_component_key(s.id,r.row_no,'handoff',r.generation) THEN 'entered' ELSE 'linked' END,flags='{}' WHERE id=r.id;
    PERFORM public.fts_apply_sheet_prepay(r.id,p_manual);
  END IF;
  SELECT * INTO r FROM public.fts_sheet_rows WHERE id=r.id; RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fts_apply_sheet_scan(p_campaign_id uuid,p_sheet_code text,p_reader text,p_rows jsonb,p_released_at timestamptz,p_request_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; s public.fts_sheets; scan public.fts_sheet_scans; r public.fts_sheet_rows; v jsonb; n int; entered int:=0; awaiting int:=0; reviewed int:=0; already int:=0; skipped int:=0; old_id uuid; old_prepay uuid; result jsonb; BEGIN
  a:=public.fts_actor(p_campaign_id); IF NOT a.is_admin THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
  IF p_request_key IS NULL OR p_released_at IS NULL OR p_released_at>now()+interval '2 minutes' OR p_reader IS DISTINCT FROM 'local:tesseract-7' THEN RAISE EXCEPTION 'A completed local read is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO s FROM public.fts_sheets WHERE campaign_id=p_campaign_id AND sheet_code=p_sheet_code AND status='open';
  IF s.id IS NULL THEN RAISE EXCEPTION 'Choose a registered open sheet' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows)>12 THEN RAISE EXCEPTION 'Invalid sheet rows' USING ERRCODE='22023'; END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_rows) LOOP PERFORM public.fts_clean_sheet_reading(v); END LOOP;
  IF (SELECT count(DISTINCT x->>'row_no') FROM jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) THEN RAISE EXCEPTION 'Repeated row numbers' USING ERRCODE='22023'; END IF;
  SELECT * INTO scan FROM public.fts_sheet_scans WHERE campaign_id=p_campaign_id AND request_key=p_request_key;
  IF scan.id IS NOT NULL THEN
    IF scan.sheet_id<>s.id OR scan.summary->'input' IS DISTINCT FROM p_rows THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE='23505'; END IF;
    RETURN scan.summary-'input';
  END IF;
  INSERT INTO public.fts_sheet_scans(campaign_id,org_id,sheet_id,uploaded_by,reader,image_deleted_at,request_key)
    VALUES(p_campaign_id,(a.camp).org_id,s.id,auth.uid(),p_reader,p_released_at,p_request_key) RETURNING * INTO scan;
  FOR v IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF COALESCE((v->>'blank')::boolean,false) THEN CONTINUE; END IF;
    n:=(v->>'row_no')::int;
    SELECT * INTO r FROM public.fts_sheet_rows WHERE sheet_id=s.id AND row_no=n; old_id:=r.handoff_activity_id; old_prepay:=r.prepay_activity_id;
    INSERT INTO public.fts_sheet_rows(campaign_id,org_id,sheet_id,row_no,last_scan_id,reading)
      VALUES(p_campaign_id,(a.camp).org_id,s.id,n,scan.id,v)
      ON CONFLICT(sheet_id,row_no) DO UPDATE SET previous_reading=fts_sheet_rows.reading,reading=EXCLUDED.reading,last_scan_id=EXCLUDED.last_scan_id,updated_at=now() RETURNING * INTO r;
    r:=public.fts_apply_sheet_row(r.id);
    IF r.handoff_state='flagged' OR r.prepay_state='flagged' THEN reviewed:=reviewed+1; END IF;
    IF r.handoff_state='skipped' THEN skipped:=skipped+1;
    ELSIF old_id IS NOT NULL AND r.handoff_activity_id=old_id AND (r.prepay_activity_id IS NOT DISTINCT FROM old_prepay) THEN already:=already+1;
    ELSIF r.handoff_state='awaiting' THEN awaiting:=awaiting+1;
    ELSIF r.handoff_state IN ('entered','linked') THEN entered:=entered+1; END IF;
  END LOOP;
  result:=jsonb_build_object('scan_id',scan.id,'entered',entered,'awaiting',awaiting,'needs_review',reviewed,'already_in',already,'skipped',skipped);
  UPDATE public.fts_sheet_scans SET summary=result||jsonb_build_object('input',p_rows) WHERE id=scan.id;
  PERFORM public.fts_log(a.camp,'sheet_scan',scan.id,NULL,'read',NULL,result); RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.fts_resolve_sheet_row(p_row_id uuid,p_action text,p_employee_id uuid DEFAULT NULL,p_link_activity_id uuid DEFAULT NULL,p_occurred_at timestamptz DEFAULT NULL,p_prepay_at timestamptz DEFAULT NULL,p_reason text DEFAULT NULL,p_verify_handoff boolean DEFAULT false,p_verify_prepay boolean DEFAULT false)
RETURNS public.fts_sheet_rows LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.fts_sheet_rows; a record; before jsonb; v jsonb; b public.fts_activities; old_id uuid; BEGIN
  SELECT * INTO r FROM public.fts_sheet_rows WHERE id=p_row_id; IF r.id IS NULL THEN RAISE EXCEPTION 'Row not found' USING ERRCODE='P0002'; END IF;
  a:=public.fts_actor(r.campaign_id); IF NOT a.is_admin THEN RAISE EXCEPTION 'Manager access required' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.fts_sheet_rows WHERE id=p_row_id FOR UPDATE; before:=to_jsonb(r); v:=r.reading;
  IF p_action='keep_original' THEN
    IF r.accepted_reading IS NULL THEN RAISE EXCEPTION 'No original entry' USING ERRCODE='22023'; END IF;
    UPDATE public.fts_sheet_rows SET reading=accepted_reading,flags='{}' WHERE id=r.id;
    r:=public.fts_apply_sheet_row(r.id,true);
  ELSIF p_action='skip' THEN
    UPDATE public.fts_sheet_rows SET handoff_state=CASE WHEN handoff_activity_id IS NULL THEN 'skipped' ELSE handoff_state END,prepay_state=CASE WHEN prepay_activity_id IS NULL THEN 'skipped' ELSE prepay_state END,flags='{}' WHERE id=r.id;
    -- Skipping an uncertain corrected reading preserves already awarded points.
    IF r.handoff_activity_id IS NOT NULL THEN UPDATE public.fts_sheet_rows SET reading=COALESCE(accepted_reading,reading) WHERE id=r.id; r:=public.fts_apply_sheet_row(r.id,true); END IF;
  ELSIF p_action='no_prepay' THEN
    IF EXISTS(SELECT 1 FROM public.fts_activities WHERE id=r.prepay_activity_id AND status='approved') THEN RAISE EXCEPTION 'Reverse the awarded bonus first' USING ERRCODE='22023'; END IF;
    UPDATE public.fts_sheet_rows SET prepay_state='skipped',flags=array_remove(array_remove(array_remove(array_remove(flags,'prepay_unclear'),'prepay_unreadable'),'prepay_invalid_time'),'prepay_changed') WHERE id=r.id;
  ELSIF p_action IN ('enter','enter_both','link','replace','verify_prepay') THEN
    IF p_employee_id IS NOT NULL THEN PERFORM public.fts_require_participant(a.camp,p_employee_id); v:=jsonb_set(v,'{credit_employee_id}',to_jsonb(p_employee_id::text)); END IF;
    IF p_occurred_at IS NOT NULL THEN PERFORM public.fts_require_in_window(a.camp,p_occurred_at); v:=jsonb_set(v,'{occurred_at}',to_jsonb(to_char(p_occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))); END IF;
    IF p_prepay_at IS NOT NULL THEN PERFORM public.fts_require_in_window(a.camp,p_prepay_at); v:=jsonb_set(v,'{prepay_at}',to_jsonb(to_char(p_prepay_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))); END IF;
    v:=v||jsonb_build_object('handoff_verified',p_verify_handoff,'prepay_verified',p_verify_prepay,'crossed_out',false);
    v:=jsonb_set(v,'{confidence}',(v->'confidence')||jsonb_build_object('credit',1,'occurred_at',1,'handoff_verified',1,'prepay_verified',1,'prepay_at',1));
    IF p_verify_prepay THEN v:=v||jsonb_build_object('prepay_yes',true); v:=jsonb_set(v,'{confidence}',(v->'confidence')||jsonb_build_object('prepay_yes',1)); END IF;
    IF p_action='verify_prepay' THEN
      IF NOT p_verify_prepay THEN RAISE EXCEPTION 'Confirm actual prepayment' USING ERRCODE='22023'; END IF;
      SELECT * INTO b FROM public.fts_activities WHERE id=r.handoff_activity_id;
      IF b.status IS DISTINCT FROM 'approved' OR (p_employee_id IS NOT NULL AND b.employee_id<>p_employee_id) OR (p_occurred_at IS NOT NULL AND b.occurred_at<>p_occurred_at) THEN RAISE EXCEPTION 'Prepayment must stay linked to the original approved handoff' USING ERRCODE='22023'; END IF;
      v:=v||jsonb_build_object('prepay_yes',true); v:=jsonb_set(v,'{confidence}',(v->'confidence')||jsonb_build_object('prepay_yes',1));
      UPDATE public.fts_sheet_rows SET reading=v,prepay_state='not_verified',flags='{}' WHERE id=r.id;
      PERFORM public.fts_apply_sheet_prepay(r.id,true);
    ELSE
      IF p_action='replace' THEN
        IF NOT p_verify_handoff THEN RAISE EXCEPTION 'Verify the corrected handoff first' USING ERRCODE='22023'; END IF;
        old_id:=r.handoff_activity_id;
        FOR b IN SELECT * FROM public.fts_activities WHERE parent_id=old_id AND status='approved' LOOP PERFORM public.fts_reverse(b.id,p_reason); END LOOP;
        SELECT * INTO b FROM public.fts_activities WHERE id=old_id;
        IF b.status='approved' THEN PERFORM public.fts_reverse(b.id,p_reason);
        ELSIF b.status='pending' THEN PERFORM public.fts_verify(b.id,false,p_reason); END IF;
        UPDATE public.fts_sheet_rows SET handoff_activity_id=NULL,prepay_activity_id=NULL,accepted_reading=NULL,generation=generation+1,handoff_state='blank',prepay_state='none' WHERE id=r.id;
      END IF;
      IF p_action='link' AND p_link_activity_id IS NULL THEN RAISE EXCEPTION 'Choose the original app entry' USING ERRCODE='22023'; END IF;
      IF p_action IN ('enter_both','enter') THEN v:=v||jsonb_build_object('app_code',NULL); END IF;
      UPDATE public.fts_sheet_rows SET reading=v,flags='{}' WHERE id=r.id;
      r:=public.fts_apply_sheet_row(r.id,true,p_link_activity_id);
      IF old_id IS NOT NULL AND r.handoff_activity_id IS NOT NULL THEN UPDATE public.fts_activities SET supersedes_id=old_id WHERE id=r.handoff_activity_id; END IF;
    END IF;
  ELSE RAISE EXCEPTION 'Choose a row resolution' USING ERRCODE='22023'; END IF;
  UPDATE public.fts_sheet_rows SET resolved_by=auth.uid(),resolved_at=now(),updated_at=now() WHERE id=r.id RETURNING * INTO r;
  PERFORM public.fts_log(a.camp,'sheet_row',r.id,r.credit_employee_id,p_action,before,to_jsonb(r)); RETURN r;
END $$;

-- Privileges are granted explicitly after all functions (including updated
-- record RPCs appended below) are defined.
DO $$ DECLARE f regprocedure; BEGIN
  FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
    'fts_roster_names','fts_print_sheet','fts_void_sheet','fts_set_weekly_check','fts_validate_reader','fts_set_auto_import',
    'fts_clean_sheet_reading','fts_sheet_signature','fts_component_key','fts_sync_sheet_activity','fts_apply_sheet_prepay','fts_apply_sheet_row','fts_apply_sheet_scan','fts_resolve_sheet_row') LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION '||f||' FROM PUBLIC,anon,authenticated';
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.fts_roster_names(uuid),public.fts_print_sheet(uuid,date,uuid),public.fts_void_sheet(uuid),
  public.fts_set_weekly_check(uuid,date,text,boolean),public.fts_validate_reader(uuid,int,int,numeric,int,int),public.fts_set_auto_import(uuid,boolean),
  public.fts_apply_sheet_scan(uuid,text,text,jsonb,timestamptz,uuid),public.fts_resolve_sheet_row(uuid,text,uuid,uuid,timestamptz,timestamptz,text,boolean,boolean) TO authenticated;

DROP FUNCTION public.fts_record_own(uuid,text,timestamptz,int,uuid);
CREATE OR REPLACE FUNCTION public.fts_record_own(p_campaign_id uuid, p_type text, p_occurred_at timestamptz, p_quantity int, p_request_key uuid, p_booked_by uuid DEFAULT NULL)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r public.fts_activities; pts int;
BEGIN
  a := public.fts_actor(p_campaign_id);
  IF a.employee_id IS NULL THEN RAISE EXCEPTION 'No team member record for your account' USING ERRCODE = '42501'; END IF;
  IF (a.camp).status <> 'active' THEN RAISE EXCEPTION 'This campaign is closed' USING ERRCODE = '22023'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('qr_card','unscheduled_booking','operative_handoff','chairside_card') THEN
    RAISE EXCEPTION 'Team members cannot record that action' USING ERRCODE = '42501'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Missing request key' USING ERRCODE = '22023'; END IF;
  IF p_booked_by IS NOT NULL THEN
    IF p_type IS DISTINCT FROM 'operative_handoff' THEN RAISE EXCEPTION 'Booked by applies to a handoff only' USING ERRCODE='22023'; END IF;
    PERFORM public.fts_require_participant(a.camp,p_booked_by);
  END IF;
  SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key;
  IF r.id IS NOT NULL THEN
    IF r.employee_id <> a.employee_id OR r.activity_type IS DISTINCT FROM p_type OR r.booked_by_employee_id IS DISTINCT FROM p_booked_by OR r.quantity IS DISTINCT FROM p_quantity OR r.occurred_at IS DISTINCT FROM p_occurred_at THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '23505'; END IF;
    RETURN r;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR (p_type <> 'qr_card' AND p_quantity <> 1) OR p_quantity > 20 THEN
    RAISE EXCEPTION 'Invalid count' USING ERRCODE = '22023'; END IF;
  PERFORM public.fts_require_participant(a.camp, a.employee_id);
  PERFORM public.fts_require_in_window(a.camp, p_occurred_at);
  pts := CASE WHEN p_type = 'qr_card' THEN (a.camp).pts_qr_card * p_quantity END;
  INSERT INTO public.fts_activities (campaign_id, org_id, employee_id, activity_type, occurred_at, tally_week, quantity,
      status, awarded_points, request_key, recorded_by, verified_at, source, booked_by_employee_id)
    VALUES (p_campaign_id, (a.camp).org_id, a.employee_id, p_type, p_occurred_at,
      public.fts_week_key(p_occurred_at, (a.camp).timezone, (a.camp).ends_on), p_quantity,
      CASE WHEN p_type = 'qr_card' THEN 'approved' ELSE 'pending' END, pts, p_request_key, auth.uid(),
      CASE WHEN p_type = 'qr_card' THEN now() END, 'web', p_booked_by)
    ON CONFLICT (campaign_id, request_key) DO NOTHING
    RETURNING * INTO r;
  IF r.id IS NULL THEN
    SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key;
    IF r.employee_id <> a.employee_id OR r.activity_type IS DISTINCT FROM p_type OR r.booked_by_employee_id IS DISTINCT FROM p_booked_by OR r.quantity IS DISTINCT FROM p_quantity OR r.occurred_at IS DISTINCT FROM p_occurred_at THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '23505'; END IF;
    RETURN r;
  END IF;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, 'recorded', NULL, to_jsonb(r));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.fts_record_own(uuid,text,timestamptz,int,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fts_record_own(uuid,text,timestamptz,int,uuid,uuid) TO authenticated;

DROP FUNCTION public.fts_record_for(uuid,uuid,text,timestamptz,int,uuid);
CREATE OR REPLACE FUNCTION public.fts_record_for(p_campaign_id uuid, p_employee_id uuid, p_type text, p_occurred_at timestamptz, p_quantity int, p_request_key uuid, p_booked_by uuid DEFAULT NULL)
RETURNS public.fts_activities LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record; r public.fts_activities; pts int;
BEGIN
  a := public.fts_actor(p_campaign_id);
  IF NOT a.is_admin THEN RAISE EXCEPTION 'Only an owner or manager can record another employee action' USING ERRCODE = '42501'; END IF;
  IF (a.camp).status <> 'active' THEN RAISE EXCEPTION 'This campaign is closed' USING ERRCODE = '22023'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('qr_card','unscheduled_booking','operative_handoff','chairside_card') THEN
    RAISE EXCEPTION 'Team members cannot record that action' USING ERRCODE = '42501'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Missing request key' USING ERRCODE = '22023'; END IF;
  IF p_booked_by IS NOT NULL THEN
    IF p_type IS DISTINCT FROM 'operative_handoff' THEN RAISE EXCEPTION 'Booked by applies to a handoff only' USING ERRCODE='22023'; END IF;
    PERFORM public.fts_require_participant(a.camp,p_booked_by);
  END IF;
  SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key;
  IF r.id IS NOT NULL THEN
    IF r.employee_id <> p_employee_id OR r.activity_type IS DISTINCT FROM p_type OR r.booked_by_employee_id IS DISTINCT FROM p_booked_by OR r.quantity IS DISTINCT FROM p_quantity OR r.occurred_at IS DISTINCT FROM p_occurred_at THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '23505'; END IF;
    RETURN r;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR (p_type <> 'qr_card' AND p_quantity <> 1) OR p_quantity > 20 THEN
    RAISE EXCEPTION 'Invalid count' USING ERRCODE = '22023'; END IF;
  PERFORM public.fts_require_participant(a.camp, p_employee_id);
  PERFORM public.fts_require_in_window(a.camp, p_occurred_at);
  pts := CASE WHEN p_type = 'qr_card' THEN (a.camp).pts_qr_card * p_quantity END;
  INSERT INTO public.fts_activities (campaign_id, org_id, employee_id, activity_type, occurred_at, tally_week, quantity,
      status, awarded_points, request_key, recorded_by, verified_at, source, booked_by_employee_id)
    VALUES (p_campaign_id, (a.camp).org_id, p_employee_id, p_type, p_occurred_at,
      public.fts_week_key(p_occurred_at, (a.camp).timezone, (a.camp).ends_on), p_quantity,
      CASE WHEN p_type = 'qr_card' THEN 'approved' ELSE 'pending' END, pts, p_request_key, auth.uid(),
      CASE WHEN p_type = 'qr_card' THEN now() END, 'manager', p_booked_by)
    ON CONFLICT (campaign_id, request_key) DO NOTHING
    RETURNING * INTO r;
  IF r.id IS NULL THEN
    SELECT * INTO r FROM public.fts_activities WHERE campaign_id = p_campaign_id AND request_key = p_request_key;
    IF r.employee_id <> p_employee_id OR r.activity_type IS DISTINCT FROM p_type OR r.booked_by_employee_id IS DISTINCT FROM p_booked_by OR r.quantity IS DISTINCT FROM p_quantity OR r.occurred_at IS DISTINCT FROM p_occurred_at THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE = '23505'; END IF;
    RETURN r;
  END IF;
  PERFORM public.fts_log(a.camp, 'activity', r.id, r.employee_id, 'recorded', NULL, to_jsonb(r));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.fts_record_for(uuid,uuid,text,timestamptz,int,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fts_record_for(uuid,uuid,text,timestamptz,int,uuid,uuid) TO authenticated;
