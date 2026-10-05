import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase as client } from '@/integrations/supabase/pending-schema';
import type { FillScheduleFunctions, FillScheduleTables } from '@/integrations/supabase/pending-schema';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Activity, Audit, Calls, Campaign, Huddle, Ledger, Metric, Participant, PrizePick, RosterName, ScheduleSheet, ScheduleSheetRow, WeeklyCheck } from '@/lib/fill-the-schedule';

async function rows<T>(table: Exclude<keyof FillScheduleTables, 'fts_campaigns'>, campaignId: string): Promise<T[]> {
  const all: T[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from(table).select('*').eq('campaign_id', campaignId).order('id').range(start, start + 499);
    if (error) throw error;
    all.push(...(data as unknown as T[]));
    if (data.length < 500) return all;
  }
}
export function useFillSchedule() {
  const context = useOrgContext(); const ctx = context.data;
  const manager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const query = useQuery({
    queryKey: ['fill-the-schedule', ctx?.org_id, ctx?.user_id, manager], enabled: !!ctx,
    staleTime: 15_000, refetchOnWindowFocus: true, refetchInterval: 60_000,
    queryFn: async (): Promise<Ledger | null> => {
      const { data, error } = await client.from('fts_campaigns').select('*').eq('org_id', ctx!.org_id).eq('name', 'Fill the Schedule').maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const campaign = data as Campaign;
      const [participants, activities, calls, huddles, metrics, picks, audit, sheets, sheetRows, checks] = await Promise.all([
        rows<Participant>('fts_participants', campaign.id), rows<Activity>('fts_activities', campaign.id), rows<Calls>('fts_weekly_calls', campaign.id),
        rows<Huddle>('fts_huddle_attendance', campaign.id), rows<Metric>('fts_week_metrics', campaign.id), rows<PrizePick>('fts_prize_picks', campaign.id),
        manager ? rows<Audit>('fts_audit', campaign.id) : Promise.resolve([] as Audit[]),
        manager ? rows<ScheduleSheet>('fts_sheets', campaign.id) : Promise.resolve([] as ScheduleSheet[]),
        manager ? rows<ScheduleSheetRow>('fts_sheet_rows', campaign.id) : Promise.resolve([] as ScheduleSheetRow[]),
        manager ? rows<WeeklyCheck>('fts_weekly_checks', campaign.id) : Promise.resolve([] as WeeklyCheck[]),
      ]);
      // Only roster names, never personal contact, payroll or patient data.
      const roster = await client.rpc('fts_roster_names', { p_campaign_id: campaign.id });
      if (roster.error) throw roster.error;
      const names = roster.data as RosterName[];
      return { campaign, participants, activities, calls, huddles, metrics, picks, names, audit, sheets, sheetRows, checks };
    },
  });
  return { ...query, ctx, manager, contextLoading: context.isLoading, contextError: context.error };
}

/** Single in-flight write, stable request key on ambiguous failure, no automatic replay. */
export function useFillScheduleWrite() {
  const qc = useQueryClient(); const lock = useRef(false);
  const retry = useRef(new Map<string, string>());
  const resultRef = useRef<unknown>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function write(fn: keyof FillScheduleFunctions, params: Record<string, unknown>, success: string, keyed = false) {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const fingerprint = JSON.stringify([fn, params]);
    const key = retry.current.get(fingerprint) ?? crypto.randomUUID();
    if (keyed) retry.current.set(fingerprint, key);
    try {
      const args = (keyed ? { ...params, p_request_key: key } : params) as FillScheduleFunctions[typeof fn]['Args'];
      const result = await client.rpc(fn, args);
      if (result.error) throw result.error;
      resultRef.current = result.data;
      retry.current.delete(fingerprint); setMessage(success);
      await qc.invalidateQueries({ queryKey: ['fill-the-schedule'] }); return true;
    } catch (e: unknown) {
      setError(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Could not save. Check your connection and retry.'); return false;
    } finally { lock.current = false; setBusy(false); }
  }
  return { write, busy, error, message, resultRef };
}
