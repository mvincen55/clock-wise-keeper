-- The office starts this campaign Monday October 5. The first Friday tally
-- is October 9 at noon Eastern. Preserve all records; refuse a date change
-- that would strand already-entered earlier scores or prizes.
DO $$
DECLARE c public.fts_campaigns;
BEGIN
  SELECT * INTO c FROM public.fts_campaigns
    WHERE org_id='852fc8e0-4071-499b-b655-f86d6f789cd5'
      AND name='Fill the Schedule' AND ends_on='2026-12-31'
    FOR UPDATE;
  IF c.id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.fts_activities a WHERE a.campaign_id=c.id
       AND (a.occurred_at AT TIME ZONE c.timezone)::date < date '2026-10-05')
    OR EXISTS (SELECT 1 FROM public.fts_weekly_calls w WHERE w.campaign_id=c.id AND w.week_key < date '2026-10-09')
    OR EXISTS (SELECT 1 FROM public.fts_huddle_attendance h WHERE h.campaign_id=c.id AND h.huddle_date < date '2026-10-05')
    OR EXISTS (SELECT 1 FROM public.fts_prize_picks p WHERE p.campaign_id=c.id AND p.week_key < date '2026-10-09') THEN
    RAISE EXCEPTION 'Review earlier campaign records before moving the start date';
  END IF;
  UPDATE public.fts_campaigns SET starts_on='2026-10-05' WHERE id=c.id;
END $$;
