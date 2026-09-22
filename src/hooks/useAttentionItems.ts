import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOrgAttendanceSnapshot, useOwnerUserIds } from '@/hooks/useOrgAttendanceSnapshot';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { useAttendanceDayStatus } from '@/hooks/useAttendanceDayStatus';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { useOrgDaysOff } from '@/hooks/useDaysOff';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { useOrgAttendanceExceptions } from '@/hooks/useAttendanceExceptions';
import { useTardies } from '@/hooks/useTardies';
import { useOrgPtoRequests } from '@/hooks/usePtoRequests';
import { useOrgCorrectionRequests } from '@/hooks/useCorrectionRequests';
import { useOrgChangeRequests } from '@/hooks/useChangeRequests';
import { useRecentDepositLogs } from '@/hooks/useDepositLog';
import { useOrgBypasses } from '@/hooks/useChecklistBypasses';
import { useOrgAccountabilityReports } from '@/hooks/useAccountability';
import { useKnowledgeAcknowledgmentRoster } from '@/hooks/useKnowledgeAcknowledgments';
import { useTrainingAssignments, useTrainingModules } from '@/hooks/useTraining';
import { useIncidentReports } from '@/hooks/useIncidentReports';
import { useKnowledgeWorkspace } from '@/hooks/useKnowledge';
import { useTeamGoals } from '@/hooks/useTeamGoals';
import { useManagerFollowups } from '@/hooks/useManagerFollowups';
import { officeStatus } from '@/components/dashboard/staffing';
import { easternWallMinutes, getToday, shiftDate } from '@/lib/time-utils';
import {
  closeoutsFrom, deriveAttention, lastCompletedPayPeriod, queryStatus, versionsInReviewFrom,
  type AttentionResult, type AttentionSources, type SourceStatus,
} from '@/lib/attention';

/**
 * How far back Attention reads the record of time. Long enough to cover the
 * last completed bi-weekly period plus the current one; older conditions
 * belong to a payroll period already run and are not "now".
 */
export const ATTENTION_WINDOW_DAYS = 30;

/**
 * Office rules that admit follow-ups. None of these has a settings knob yet;
 * each is the rule the product already runs on, written down once here.
 */
export const ATTENTION_RULES = {
  /** Tardies past grace are created by the recompute and reviewed by a manager. */
  reviewTardies: true,
  /** A checklist bypass with no reason after one working day needs manager follow-up. */
  bypassReasonHours: 24,
  /** knowledge_acknowledgments.escalation_level once the manager step has been sent. */
  ackManagerLevel: 3,
} as const;

export type AttentionItemsResult = AttentionResult & {
  /** False for members: no source is read and the result is empty. */
  enabled: boolean;
  today: string;
  payrollPeriod: AttentionSources['payrollPeriod'];
};

const EMPTY: AttentionResult = {
  unresolved: [], needsNow: [], waiting: [], deferred: [],
  counts: { unresolved: 0, needsNow: 0, waiting: 0, deferred: 0, byVerb: { decide: 0, fix: 0, follow_up: 0 } },
  degradedSources: [],
};

/**
 * The one selector every management surface reads (design §5): every open
 * item under the admission rule, ordered by consequence, with the manager's
 * follow-up state attached. Mount it only where a manager is signed in —
 * it reads the office's records, not one person's.
 */
export function useAttentionItems(): AttentionItemsResult {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const enabled = !!user && !!ctx && isManager;

  const today = getToday();
  const windowStart = shiftDate(today, -ATTENTION_WINDOW_DAYS);

  const employees = useOrgEmployees();
  const owners = useOwnerUserIds();
  const payroll = usePayrollSettings();
  const snapshot = useOrgAttendanceSnapshot(today);
  const dayStatuses = useAttendanceDayStatus(windowStart, today);
  const entries = useTimeEntries(windowStart, today, 'all');
  const daysOff = useOrgDaysOff(windowStart, today, enabled);
  // Every closure, not one year's: the window can straddle New Year.
  const closures = useOfficeClosures();
  const exceptions = useOrgAttendanceExceptions(windowStart, today, enabled);
  const tardies = useTardies(windowStart, today);
  const ptoRequests = useOrgPtoRequests('pending');
  const corrections = useOrgCorrectionRequests('pending');
  const changeRequests = useOrgChangeRequests('pending');
  const depositLogs = useRecentDepositLogs(14);
  const bypasses = useOrgBypasses(enabled ? ctx?.org_id : undefined);
  const accountability = useOrgAccountabilityReports(enabled);
  const acks = useKnowledgeAcknowledgmentRoster();
  const training = useTrainingAssignments();
  const modules = useTrainingModules();
  const incidents = useIncidentReports();
  const knowledge = useKnowledgeWorkspace();
  const goals = useTeamGoals();
  const followups = useManagerFollowups(enabled);

  return useMemo(() => {
    const payrollPeriod = payroll.data
      ? (() => {
          const p = lastCompletedPayPeriod(today, payroll.data);
          return { start: p.start, end: p.end, dueDate: p.dueDate, dueLabel: p.dueLabel };
        })()
      : null;
    if (!enabled || !user || !ctx) return { ...EMPTY, enabled: false, today, payrollPeriod };

    const now = new Date();
    const ownerUserIds = owners.data ?? new Set<string>();
    const rosterStatus: SourceStatus = employees.isError || owners.isError
      ? { state: 'error', asOf: null }
      : employees.data === undefined || owners.data === undefined
        ? { state: 'loading', asOf: null }
        : { state: 'ok', asOf: new Date(Math.min(employees.dataUpdatedAt, owners.dataUpdatedAt)).toISOString() };

    const sources: AttentionSources = {
      today,
      nowIso: now.toISOString(),
      nowMinutes: easternWallMinutes(now),
      bufferMinutes: payroll.data?.missing_shift_buffer_minutes ?? 60,
      officePhase: snapshot.data ? officeStatus(snapshot.data, now).phase : 'unknown_hours',
      viewer: { userId: user.id, role: ctx.role === 'owner' ? 'owner' : 'manager' },
      employees: (employees.data ?? []).map(e => ({ id: e.id, user_id: e.user_id ?? null, display_name: e.display_name })),
      ownerUserIds,
      payrollPeriod,
      rules: ATTENTION_RULES,
      dayStatuses: dayStatuses.data,
      entries: entries.data,
      daysOff: daysOff.data,
      closures: closures.data,
      exceptions: exceptions.data,
      tardies: tardies.data,
      ptoRequests: ptoRequests.data,
      corrections: corrections.data,
      changeRequests: changeRequests.data,
      closeouts: depositLogs.data && dayStatuses.data ? closeoutsFrom(depositLogs.data, dayStatuses.data, today, ownerUserIds) : undefined,
      bypasses: bypasses.data,
      accountability: accountability.data,
      acks: acks.data,
      training: training.data,
      trainingTitles: modules.data ? new Map(modules.data.map(m => [m.id, m.title])) : undefined,
      incidents: incidents.data,
      versionsInReview: knowledge.data ? versionsInReviewFrom(knowledge.data.items) : undefined,
      challenges: goals.data?.live,
      followups: followups.data,
      sources: {
        roster: rosterStatus,
        dayStatuses: queryStatus(dayStatuses),
        entries: queryStatus(entries),
        daysOff: queryStatus(daysOff),
        closures: queryStatus(closures),
        exceptions: queryStatus(exceptions),
        tardies: queryStatus(tardies),
        ptoRequests: queryStatus(ptoRequests),
        corrections: queryStatus(corrections),
        changeRequests: queryStatus(changeRequests),
        closeouts: depositLogs.isError ? queryStatus(depositLogs) : queryStatus(dayStatuses).state === 'ok' ? queryStatus(depositLogs) : queryStatus(dayStatuses),
        bypasses: queryStatus(bypasses),
        accountability: queryStatus(accountability),
        acks: queryStatus(acks),
        training: queryStatus(training),
        incidents: queryStatus(incidents),
        versionsInReview: queryStatus(knowledge),
        challenges: queryStatus(goals),
        followups: queryStatus(followups),
      },
    };
    return { ...deriveAttention(sources), enabled: true, today, payrollPeriod };
  }, [
    enabled, user, ctx, today, employees, owners, payroll, snapshot, dayStatuses, entries, daysOff, closures, exceptions, tardies,
    ptoRequests, corrections, changeRequests, depositLogs, bypasses, accountability, acks, training, modules, incidents, knowledge,
    goals, followups,
  ]);
}
