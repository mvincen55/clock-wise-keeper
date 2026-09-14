ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS location_status text NOT NULL DEFAULT 'unknown'
  CHECK (location_status IN ('unknown','onsite','remote'));
ALTER TABLE public.office_attendance_settings ADD COLUMN IF NOT EXISTS timekeeping_history_start_at timestamptz;

CREATE OR REPLACE FUNCTION public.classify_clock_location(p_org uuid,p_lat double precision,p_lng double precision,p_accuracy double precision)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE z record; distance double precision; all_outside boolean:=true; has_zone boolean:=false;
BEGIN
 IF p_lat IS NULL OR p_lng IS NULL OR p_accuracy IS NULL OR NOT(p_lat BETWEEN -90 AND 90)
  OR NOT(p_lng BETWEEN -180 AND 180) OR NOT(p_accuracy BETWEEN 0 AND 100) THEN RETURN 'unknown'; END IF;
 FOR z IN SELECT * FROM public.work_zones WHERE org_id=p_org AND is_active LOOP
  has_zone:=true;
  distance:=6371000*2*asin(sqrt(least(1.0,
   power(sin(radians(p_lat-z.latitude)/2),2)+cos(radians(z.latitude))*cos(radians(p_lat))*power(sin(radians(p_lng-z.longitude)/2),2))));
  IF distance+p_accuracy <= z.radius_meters THEN RETURN 'onsite'; END IF;
  IF distance-p_accuracy <= z.radius_meters THEN all_outside:=false; END IF;
 END LOOP;
 IF has_zone AND all_outside THEN RETURN 'remote'; END IF;
 RETURN 'unknown';
END $$;
REVOKE ALL ON FUNCTION public.classify_clock_location(uuid,double precision,double precision,double precision) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_punch_with_location(p_action text,p_lat double precision DEFAULT NULL,p_lng double precision DEFAULT NULL,p_accuracy double precision DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; office uuid; location text;
BEGIN
 -- The existing core owns authorization, server time, sequencing and audit.
 result:=public.record_punch(p_action);
 SELECT org_id INTO office FROM public.time_entries WHERE id=(result->>'entry_id')::uuid;
 location:=public.classify_clock_location(office,p_lat,p_lng,p_accuracy);
 IF p_lat BETWEEN -90 AND 90 AND p_lng BETWEEN -180 AND 180 AND p_accuracy BETWEEN 0 AND 100 THEN
  UPDATE public.punches SET location_lat=p_lat,location_lng=p_lng,low_confidence=(location='unknown')
    WHERE id=(result->>'punch_id')::uuid;
 END IF;
 -- A clock-out near the parking lot must not relabel the shift as remote.
 IF result->>'punch_type'='in' THEN
  UPDATE public.time_entries SET location_status=location,is_remote=(location='remote')
    WHERE id=(result->>'entry_id')::uuid;
 END IF;
 RETURN result || jsonb_build_object('location_status',location);
END $$;
REVOKE ALL ON FUNCTION public.record_punch_with_location(text,double precision,double precision,double precision) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_punch_with_location(text,double precision,double precision,double precision) TO authenticated;

