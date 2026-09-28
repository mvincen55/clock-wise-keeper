import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/pending-schema';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';
import { getToday, shiftDate } from '@/lib/time-utils';
import { scrubFreeText } from '../../supabase/functions/_shared/phi-scrub';

// Daily deposit sheet: one record per office day. Check amounts only —
// no payer names, no account numbers.
//
// The same row is the Close the Day record: staffing reality (the front
// desk's human assessment — never overwritten by automated results) and the
// seal. The staffing note is business-operations text only and runs through
// the PHI scrubber before it is persisted.

export type StaffingAssessment =
  | 'extra_coverage'
  | 'about_right'
  | 'stretched'
  | 'understaffed'
  | 'unsafe';

export type DepositLog = Tables<'deposit_logs'>;

export function depositChecks(log: DepositLog | null | undefined): number[] {
  if (!log || !Array.isArray(log.checks)) return [];
  return (log.checks as unknown[]).filter((v): v is number => typeof v === 'number');
}

export function useDepositLog(date: string) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['deposit-log', ctx?.org_id, date],
    enabled: !!user && !!ctx && !!date,
    queryFn: async (): Promise<DepositLog | null> => {
      const { data, error } = await supabase
        .from('deposit_logs')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('deposit_date', date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * The office's closeouts for the last `days` days through today, oldest
 * first — what Attention reads to know whether Close the Day is behind and
 * which saved days were never sealed.
 */
export function useRecentDepositLogs(days = 14) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const today = getToday();
  const start = shiftDate(today, -days);

  return useQuery({
    queryKey: ['deposit-logs-recent', ctx?.org_id, start, today],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<DepositLog[]> => {
      const { data, error } = await supabase
        .from('deposit_logs')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .gte('deposit_date', start)
        .lte('deposit_date', today)
        .order('deposit_date');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The columns that say whether a saved row holds a closeout someone made. */
export type CloseoutContent = Pick<
  DepositLog,
  | 'cash_cents' | 'checks' | 'ins_cc_cents' | 'pt_cc_cents' | 'illumitrac_cents' | 'outside_financing_cents'
  | 'other_collections_cents' | 'production_cents' | 'hygiene_cancellations' | 'hygiene_no_shows'
  | 'doctor_cancellations' | 'doctor_no_shows' | 'new_patients_scheduled_count' | 'new_patients_seen_count'
  | 'staffing_assessment' | 'missed_appointments_recorded'
>;

/**
 * Whether a saved row is a closeout someone made: money, production, a
 * missed-appointment or new-patient count, a staffing answer, or counts
 * confirmed as recorded. A report importer that files a placeholder for
 * every calendar day (nothing recorded, counts marked not recorded) leaves
 * nothing to reopen, so such a row never makes a closed day reachable. The
 * seal is not content either: placeholders get sealed with everything else.
 */
export function closeoutHasContent(row: CloseoutContent): boolean {
  const checks = Array.isArray(row.checks) ? row.checks : [];
  return (
    row.production_cents != null ||
    row.cash_cents > 0 || checks.some(c => typeof c === 'number' && c > 0) ||
    row.ins_cc_cents > 0 || row.pt_cc_cents > 0 || row.illumitrac_cents > 0 || row.outside_financing_cents > 0 ||
    (row.other_collections_cents ?? 0) > 0 ||
    row.hygiene_cancellations > 0 || row.hygiene_no_shows > 0 || row.doctor_cancellations > 0 || row.doctor_no_shows > 0 ||
    (row.new_patients_scheduled_count ?? 0) > 0 || (row.new_patients_seen_count ?? 0) > 0 ||
    row.staffing_assessment != null ||
    row.missed_appointments_recorded === true
  );
}

/**
 * Every date the office holds a closeout with content for (see
 * `closeoutHasContent`). Close the Day keeps such a day reachable even when
 * the office calendar says closed: a closeout someone made is never hidden
 * behind the calendar, while an importer's empty placeholder on a Sunday is
 * not a reason to offer the Sunday.
 */
export function useDepositLogDates() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['deposit-log-dates', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ReadonlySet<string>> => {
      const dates: string[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase
          .from('deposit_logs')
          // One literal so the client types the rows (a built string would not).
          .select('deposit_date, cash_cents, checks, ins_cc_cents, pt_cc_cents, illumitrac_cents, outside_financing_cents, other_collections_cents, production_cents, hygiene_cancellations, hygiene_no_shows, doctor_cancellations, doctor_no_shows, new_patients_scheduled_count, new_patients_seen_count, staffing_assessment, missed_appointments_recorded')
          .eq('org_id', ctx!.org_id)
          .order('deposit_date')
          .range(offset, offset + 499);
        if (error) throw error;
        dates.push(...(data ?? []).filter(closeoutHasContent).map(row => row.deposit_date));
        if ((data ?? []).length < 500) break;
      }
      return new Set(dates);
    },
  });
}

export interface DepositLogSave {
  depositDate: string;
  cashCents: number;
  checksCents: number[];
  insCcCents: number;
  ptCcCents: number;
  illumitracCents: number;
  outsideFinancingCents: number;
  notes: string;
  productionCents: number | null;
  missedAppointmentsRecorded?: boolean;
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
  /**
   * Aggregate new-patient counts for the day. Null = not recorded — a blank
   * answer must never silently become 0, while an explicit 0 is a real answer.
   */
  newPatientsScheduledCount: number | null;
  newPatientsSeenCount: number | null;
  staffingAssessment?: StaffingAssessment | null;
  staffingPressure?: string[];
  staffingFactors?: string[];
  staffingNote?: string;
}

export function useSaveDepositLog() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: DepositLogSave) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      const { data: employee } = await supabase
        .from('employees')
        .select('display_name')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from('deposit_logs').upsert(
        {
          org_id: ctx.org_id,
          deposit_date: input.depositDate,
          cash_cents: input.cashCents,
          checks: input.checksCents,
          ins_cc_cents: input.insCcCents,
          pt_cc_cents: input.ptCcCents,
          illumitrac_cents: input.illumitracCents,
          outside_financing_cents: input.outsideFinancingCents,
          notes: input.notes.trim(),
          production_cents: input.productionCents,
          ...(input.missedAppointmentsRecorded !== undefined && { missed_appointments_recorded: input.missedAppointmentsRecorded }),
          hygiene_cancellations: input.hygieneCancellations,
          hygiene_no_shows: input.hygieneNoShows,
          doctor_cancellations: input.doctorCancellations,
          doctor_no_shows: input.doctorNoShows,
          new_patients_scheduled_count: input.newPatientsScheduledCount,
          new_patients_seen_count: input.newPatientsSeenCount,
          ...(input.staffingAssessment !== undefined && {
            staffing_assessment: input.staffingAssessment,
          }),
          ...(input.staffingPressure !== undefined && { staffing_pressure: input.staffingPressure }),
          ...(input.staffingFactors !== undefined && { staffing_factors: input.staffingFactors }),
          ...(input.staffingNote !== undefined && {
            staffing_note: scrubFreeText(input.staffingNote, 1000).text,
          }),
          prepared_by: user.id,
          prepared_by_name: employee?.display_name || user.email || '',
        },
        { onConflict: 'org_id,deposit_date' }
      );
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['deposit-log', ctx?.org_id, input.depositDate] });
      qc.invalidateQueries({ queryKey: ['deposit-logs-recent'] });
      qc.invalidateQueries({ queryKey: ['deposit-log-dates'] });
      qc.invalidateQueries({ queryKey: ['practice-vitals'] });
    },
  });
}

/**
 * Seal or unseal the day through `seal_close_day`, which applies the same
 * rule as the row policy (any member today; later, owners, managers, or the
 * closeout-history grant) and writes the audit event in the same
 * transaction. Unsealing is a separate audited action; pass its reason.
 */
export function useSealDay() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { closeoutId: string; depositDate: string; seal: boolean; reason?: string }) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      const { error } = await supabase.rpc('seal_close_day', {
        p_closeout_id: input.closeoutId,
        p_seal: input.seal,
        p_reason: input.reason ?? '',
      });
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['deposit-log', ctx?.org_id, input.depositDate] });
      qc.invalidateQueries({ queryKey: ['deposit-logs-recent'] });
    },
  });
}
