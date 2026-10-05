-- Ledger verification does not resolve an uncertain or changed paper reading.
-- Keep that reading visible until the manager explicitly resolves its row.
CREATE OR REPLACE FUNCTION public.fts_sync_sheet_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.activity_type='operative_handoff' THEN
    UPDATE public.fts_sheet_rows SET handoff_state=CASE
      WHEN NEW.status IN ('approved','pending') AND handoff_state='flagged' THEN 'flagged'
      WHEN NEW.status='approved' THEN CASE WHEN handoff_state='linked' THEN 'linked' ELSE 'entered' END
      WHEN NEW.status='pending' THEN 'awaiting' ELSE 'skipped' END,updated_at=now()
      WHERE handoff_activity_id=NEW.id;
  ELSIF NEW.activity_type='prepay_bonus' THEN
    UPDATE public.fts_sheet_rows SET prepay_state=CASE
      WHEN NEW.status='approved' AND prepay_state='flagged' THEN 'flagged'
      WHEN NEW.status='approved' THEN 'entered' ELSE 'skipped' END,updated_at=now()
      WHERE prepay_activity_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fts_sync_sheet_activity() FROM PUBLIC,anon,authenticated;
