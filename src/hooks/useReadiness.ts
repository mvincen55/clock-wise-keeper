import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOwnerUserIds } from '@/hooks/useOrgAttendanceSnapshot';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { useAttendanceDayStatus } from '@/hooks/useAttendanceDayStatus';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { useOrgDaysOff } from '@/hooks/useDaysOff';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { useOrgAttendanceExceptions } from '@/hooks/useAttendanceExceptions';
import { useOrgCorrectionRequests } from '@/hooks/useCorrectionRequests';
import { useOrgPtoRequests } from '@/hooks/usePtoRequests';
import { useWorkedHourAdjustments } from '@/hooks/useWorkedHourAdjustments';
import { useManagerFollowups } from '@/hooks/useManagerFollowups';
import { deriveReadiness, queryStatus, type ReadinessResult, type SourceStatus } from '@/lib/attention';
import { easternWallMinutes, getToday } from '@/lib/time-utils';
import { nonClockingEmployeeIds } from '@/lib/clocking';

/**
 * Payroll readiness for one period, from the period's records (design
 * §5.7). A source that is loading, failed, or stale reads as unknown, never
 * as ready. Owners and managers only.
 */
export type ReadinessHook = {
  result: ReadinessResult | null;
  enabled: boolean;
  refetch: () => void;
};

const worst = (...statuses: SourceStatus[]): SourceStatus =>
  statuses.find(s => s.state === 'error') ?? statuses.find(s => s.state !== 'ok') ?? statuses[0];

export function useReadiness(period: { start: string; end: string } | null): ReadinessHook {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const enabled = !!user && !!ctx && isManager && !!period;
  const start = period?.start;
  const end = period?.end;

  const employees = useOrgEmployees();
  const owners = useOwnerUserIds();
  const payroll = usePayrollSettings();
  const dayStatuses = useAttendanceDayStatus(start, end);
  const entries = useTimeEntries(start, end, 'all');
  const daysOff = useOrgDaysOff(start, end, enabled);
  const closures = useOfficeClosures();
  const exceptions = useOrgAttendanceExceptions(start, end, enabled);
  const corrections = useOrgCorrectionRequests('pending');
  const ptoRequests = useOrgPtoRequests('pending');
  const adjustments = useWorkedHourAdjustments(start, end);
  const followups = useManagerFollowups(enabled);

  const refetch = () => {
    void Promise.all([dayStatuses.refetch(), entries.refetch(), daysOff.refetch(), closures.refetch(), exceptions.refetch(), corrections.refetch(), ptoRequests.refetch(), adjustments.refetch(), followups.refetch(), employees.refetch(), owners.refetch()]);
  };

  const result = useMemo<ReadinessResult | null>(() => {
    if (!enabled || !period) return null;
    const rosterStatus: SourceStatus = employees.isError || owners.isError
      ? { state: 'error', asOf: null }
      : employees.data === undefined || owners.data === undefined ? { state: 'loading', asOf: null } : { state: 'ok', asOf: new Date().toISOString() };
    const attendance = worst(rosterStatus, queryStatus(dayStatuses), queryStatus(entries), queryStatus(daysOff), queryStatus(closures), queryStatus(exceptions), queryStatus(adjustments));
    const requests = worst(queryStatus(corrections), queryStatus(ptoRequests), queryStatus(followups));
    return deriveReadiness({
      period,
      today: getToday(),
      nowMinutes: easternWallMinutes(new Date()),
      bufferMinutes: payroll.data?.missing_shift_buffer_minutes ?? 60,
      weekStartDay: payroll.data?.week_start_day ?? 1,
      employees: (employees.data ?? []).map(e => ({ id: e.id, user_id: e.user_id ?? null, display_name: e.display_name })),
      ownerUserIds: owners.data ?? new Set<string>(),
      nonClockingEmployeeIds: nonClockingEmployeeIds(employees.data ?? [], owners.data ?? new Set<string>()),
      dayStatuses: dayStatuses.data ?? [],
      entries: entries.data ?? [],
      daysOff: daysOff.data ?? [],
      closures: closures.data ?? [],
      exceptions: exceptions.data ?? [],
      corrections: corrections.data ?? [],
      ptoRequests: ptoRequests.data ?? [],
      adjustments: (adjustments.data ?? []).map(a => ({ id: a.id, employee_id: a.employee_id, adjustment_date: a.entry_date, hours_delta: Number(a.hours_delta), reason: a.reason })),
      followups: followups.data ?? [],
      sources: { attendance, requests },
    });
  }, [enabled, period, employees, owners, payroll.data, dayStatuses, entries, daysOff, closures, exceptions, corrections, ptoRequests, adjustments, followups]);

  return { result, enabled, refetch };
}
