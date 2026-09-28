import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, type PendingTablesRow } from '@/integrations/supabase/pending-schema';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { OfficeDayCalendar } from '@/lib/office-days';

// The office's open days, from its own calendar: full-day closures (holidays,
// custom closures) and the dates it works although the weekly pattern says
// closed (open Saturdays). The Office Calendar shows them; Close the Day
// skips the days that are not office days. Both read `useOfficeDays`.

export type OfficeOpenDayRow = PendingTablesRow<'office_open_days'>;

const PAGE = 500;

/** Every row of a query, 500 at a time, so a long history never stops at PostgREST's default row limit. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await page(offset, offset + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/** The office's marked open days (open Saturdays), oldest first. */
export function useOfficeOpenDays() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['office-open-days', ctx?.org_id],
    enabled: !!user && !!ctx?.org_id,
    queryFn: async (): Promise<OfficeOpenDayRow[]> =>
      allRows<OfficeOpenDayRow>((from, to) =>
        supabase.from('office_open_days').select('*').eq('org_id', ctx!.org_id).order('open_date').range(from, to),
      ),
  });
}

/**
 * The calendar Close the Day and the Office Calendar share: full-day
 * closures and marked open days, each scoped to the office explicitly.
 * A failed read is an error, never an empty calendar — the caller decides
 * what to do without one.
 */
export function useOfficeDays() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['office-days', ctx?.org_id],
    enabled: !!user && !!ctx?.org_id,
    queryFn: async (): Promise<OfficeDayCalendar> => {
      const [closures, openDays] = await Promise.all([
        allRows<{ closure_date: string }>((from, to) =>
          supabase.from('office_closures').select('closure_date').eq('org_id', ctx!.org_id).eq('is_full_day', true).order('id').range(from, to),
        ),
        allRows<{ open_date: string }>((from, to) =>
          supabase.from('office_open_days').select('open_date').eq('org_id', ctx!.org_id).order('id').range(from, to),
        ),
      ]);
      return {
        closedDates: new Set(closures.map(c => c.closure_date)),
        openDates: new Set(openDays.map(d => d.open_date)),
      };
    },
  });
}

async function invalidateOfficeDays(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['office-open-days'] }),
    qc.invalidateQueries({ queryKey: ['office-days'] }),
  ]);
}

export function useAddOfficeOpenDay() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { open_date: string }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('office_open_days')
        .upsert({ org_id: ctx.org_id, open_date: input.open_date, created_by: user.id }, { onConflict: 'org_id,open_date' });
      if (error) throw error;
    },
    onSuccess: () => invalidateOfficeDays(qc),
  });
}

export function useRemoveOfficeOpenDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('office_open_days').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateOfficeDays(qc),
  });
}

export const legacyOpenSaturdaysKey = (orgId: string) => `open-saturdays-${orgId}`;

/**
 * Before the table existed, the Office Calendar kept open Saturdays in this
 * browser's localStorage. On a manager's first visit after the change, the
 * dates still there move to the office's calendar (the ones it does not
 * hold yet) and the local copy is cleared; a failed move keeps the local
 * copy for the next visit. `onMoved` hears how many dates moved, when any did.
 */
export function useMoveLegacyOpenSaturdays(
  isManager: boolean,
  known: OfficeOpenDayRow[] | undefined,
  onMoved?: (count: number) => void,
): void {
  const { data: ctx } = useOrgContext();
  const add = useAddOfficeOpenDay();
  const ran = useRef(false);
  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;
  const addMutate = add.mutateAsync;
  useEffect(() => {
    if (ran.current || !isManager || !ctx?.org_id || known === undefined) return;
    const key = legacyOpenSaturdaysKey(ctx.org_id);
    let legacy: string[] = [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      legacy = Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    } catch {
      legacy = [];
    }
    ran.current = true;
    const held = new Set(known.map(r => r.open_date));
    const missing = [...new Set(legacy)].filter(d => !held.has(d));
    (async () => {
      for (const open_date of missing) await addMutate({ open_date });
      try { localStorage.removeItem(key); } catch { /* nothing to clear */ }
      if (missing.length > 0) onMovedRef.current?.(missing.length);
    })().catch(() => { /* the local copy stays for the next visit */ });
  }, [isManager, ctx?.org_id, known, addMutate]);
}
