import { useMemo } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useTick } from '@/hooks/useTick';
import { useOrgAttendanceSnapshot, type EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { usePracticeVitals } from '@/hooks/usePracticeVitals';
import { useDepositLog, useRecentDepositLogs } from '@/hooks/useDepositLog';
import { useTeamGoals, type TeamGoal } from '@/hooks/useTeamGoals';
import { useUnresolvedBypasses } from '@/hooks/useChecklistBypasses';
import { useMyAccountabilityReports } from '@/hooks/useAccountability';
import { useMyKnowledgeAcknowledgments } from '@/hooks/useKnowledgeAcknowledgments';
import { useTrainingAssignments, useTrainingModules } from '@/hooks/useTraining';
import { useCurrentPtoBalance } from '@/hooks/usePtoEngine';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { useTodayEntry } from '@/hooks/useTimeEntries';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useMessagesCloseout } from '@/hooks/useMessagesCloseout';
import { usePracticeReportImports } from '@/hooks/usePracticeReportImports';
import { useMissedAppointmentEvents } from '@/hooks/useMissedAppointmentEvents';
import { useOfficeDays } from '@/hooks/useOfficeDays';
import { useTardies } from '@/hooks/useTardies';
import { useIncidentReports } from '@/hooks/useIncidentReports';
import { useMyPtoRequests } from '@/hooks/usePtoRequests';
import { useMyCorrectionRequests } from '@/hooks/useCorrectionRequests';
import { useChecklistGating } from '@/hooks/useChecklistGating';
import { useLateArrivalRule } from '@/hooks/useLateArrivalRule';
import { buildHomeBrief, needsYou, stateSummary, todayBand, lastDayLine } from '@/lib/home-brief';
import { buildMyWork } from '@/lib/my-work';
import { isLiveLateArrival, standingSentence, standingToday } from '@/lib/late-arrivals';
import type { PerformanceRaw } from '@/lib/home-performance';
import type { SourceState } from '@/lib/performance-series';
import type { AttentionSummary } from '@/lib/home-insights';
import { performanceBlockFrom } from './performance/block';
import { useAuth } from '@/hooks/useAuth';
import { useMyOperationalRoles } from '@/hooks/useMyOperationalRoles';
import { useMyPermissionGrants } from '@/hooks/useEmployeePermissions';
import { shortcutsFor, roleLabel as opRoleLabel, roleMission } from './opRoles';
import { buildToolGroups } from './tools';
import { getClockStatus, getRunningMinutes } from '@/lib/clock-status';
import { daysBetween, formatDate, formatTime, getToday, minutesToHHMM, shiftDate } from '@/lib/time-utils';
import { staffingSummary } from './staffing';
import {
  buildDailyBrief, buildGoalBrief, monthPaceLines, type OwnerPulseInput,
} from '@/lib/owner-pulse';
import { closeDayStatus } from '@/lib/manager-pulse';
import { rolePulseItems } from '@/lib/member-pulse';
import type {
  DashboardHeader, DashboardView, Figure, ManagerView, MemberView, OwnerView,
  PerformanceState, PermissionTier, RoleContext, RoleLane, Signal,
} from './types';
import { LATE_ARRIVAL_NOTICE_DAYS } from '@/components/LateArrivalNotice';

/**
 * Composes the EXISTING product hooks into the three role view models.
 *
 * This file adds no queries beyond the product's own hooks, no tables, and no
 * business rules — the pulse math lives in the shared deterministic layer
 * (owner-pulse.ts / manager-pulse.ts / member-pulse.ts on top of
 * metric-pace.ts), the queue in attention/, a person's own items in
 * my-work.ts. Anything Purple Envelope cannot verify from real records is
 * not rendered.
 *
 * Time semantics live in `staffing.ts`: "scheduled sometime today" is never
 * presented as "expected to be working right now", and a closed office never
 * produces staffing exceptions.
 */

const ROLE_LABEL = {
  owner: 'Owner',
  manager: 'Practice manager',
  employee: 'Team member',
} as const;

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const TIER_OF: Record<'owner' | 'manager' | 'employee', PermissionTier> = {
  owner: 'owner',
  manager: 'manager',
  employee: 'member',
};

/** A stable empty roster, so a loading snapshot never invalidates the view memo. */
const NO_ROWS: EmployeeSnapshot[] = [];

export function useDashboardView(): { view: DashboardView | null; isLoading: boolean } {
  const now = useTick(60_000);
  const { user } = useAuth();
  const { data: ctx, isLoading: ctxLoading } = useOrgContext();
  const { data: profile } = useMyProfile();

  // Shared / admin sources (each hook disables itself when the role is wrong).
  const snapshotQuery = useOrgAttendanceSnapshot();
  const snapshot = snapshotQuery.data ?? NO_ROWS;
  const vitalsQuery = usePracticeVitals();
  const vitals = vitalsQuery.data;
  const today = getToday();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  // Report history and the Dentrix postings are admin sources; the hooks stay
  // disabled for members, and the builder refuses them for members anyway.
  const reportImports = usePracticeReportImports();
  const missedEvents = useMissedAppointmentEvents(isAdmin);
  // The office calendar: closures and open Saturdays, readable by everyone.
  // A failed read is null — the meters then say they are on calendar days.
  const officeDays = useOfficeDays();
  const { data: todayLog } = useDepositLog(today);
  const { data: recentLogs } = useRecentDepositLogs(30); // the closeout strip reads the last 15 office days
  const { data: sprintData } = useTeamGoals();
  const { data: bypasses = [] } = useUnresolvedBypasses();
  // The one derived state every management surface reads (design §5.5).
  // Empty and disabled for members; they never read the office's records.
  const attention = useAttentionItems();
  const messagesCloseout = useMessagesCloseout();
  // The office's records (reports, the acknowledgment roster) are read once,
  // by useAttentionItems; Home never re-reads them for a count of its own.
  const { data: myReports = [] } = useMyAccountabilityReports();
  const { data: myAcks = [] } = useMyKnowledgeAcknowledgments();
  const { data: assignments = [] } = useTrainingAssignments();
  const { data: modules } = useTrainingModules();
  const pto = useCurrentPtoBalance();
  const { data: todayEntry } = useTodayEntry();
  // A person's own late arrivals, attendance reports, and requests.
  const { data: tardies } = useTardies(shiftDate(today, -LATE_ARRIVAL_NOTICE_DAYS), today);
  const { data: incidents } = useIncidentReports();
  const { data: myPto } = useMyPtoRequests();
  const { data: myCorrections } = useMyCorrectionRequests();
  const { data: gating } = useChecklistGating();
  const { data: lateRule } = useLateArrivalRule();

  const ops = useMyOperationalRoles();
  // Per-employee grants unlock tier-gated shortcuts (RLS enforces server-side).
  const grants = useMyPermissionGrants();
  const fourteenDaysAgo = new Date(new Date(today + 'T12:00:00Z').getTime() - 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const missingDays = useMissingShifts(fourteenDaysAgo);

  return useMemo(() => {
    if (!ctx) return { view: null, isLoading: ctxLoading };

    const sprints: TeamGoal[] = sprintData?.live ?? [];

    const firstName = (profile?.fullName || '').trim().split(' ')[0];
    const header: DashboardHeader = {
      officeName: ctx.org_name,
      roleLabel: ROLE_LABEL[ctx.role],
      personName: firstName ? `${greeting(now.getHours())}, ${firstName}` : greeting(now.getHours()),
      dateLabel: formatDate(today),
      timeLabel: formatTime(now.toISOString()),
    };

    const tier = TIER_OF[ctx.role];
    const roleContext: RoleContext = {
      tier,
      tierLabel: ROLE_LABEL[ctx.role],
      primary: ops.primary,
      primaryLabel: ops.primaryLabel,
      secondary: ops.secondary,
      secondaryLabels: ops.secondary.map(opRoleLabel),
      coveringToday: ops.coveringToday,
      coveringTodayLabels: ops.coveringToday.map(opRoleLabel),
    };

    /**
     * Operational-role lanes. A role the person is covering today may
     * contribute time-sensitive items; a backup capability never does, and
     * never widens permission — `shortcutsFor` filters by tier.
     */
    const laneUrgent = (role: typeof ops.primary): Signal[] => {
      if (!role) return [];
      const usesChecklists = shortcutsFor(role, tier, grants).some(sc => sc.to === '/checklists');
      if (!usesChecklists || bypasses.length === 0) return [];
      return [
        {
          id: `bypass-${role}`,
          label: 'Checklist bypass reasons owed',
          detail: 'A sentence closes each one. It never blocks your clock-out.',
          value: String(bypasses.length),
          href: '/checklists',
          tone: 'attention',
        },
      ];
    };

    const lanes: RoleLane[] = [];
    if (ops.primary) {
      lanes.push({
        role: ops.primary,
        label: opRoleLabel(ops.primary),
        kind: 'primary',
        mission: roleMission(ops.primary),
        shortcuts: shortcutsFor(ops.primary, tier, grants),
        urgent: [],
      });
    }
    for (const role of ops.secondary) {
      const covering = ops.coveringToday.includes(role);
      lanes.push({
        role,
        label: opRoleLabel(role),
        kind: 'backup',
        mission: roleMission(role),
        shortcuts: shortcutsFor(role, tier, grants).slice(0, 4),
        urgent: covering ? laneUrgent(role) : [],
        covering,
        note: covering ? 'Also covering today' : 'Backup — can cover, not assigned',
      });
    }
    const toolGroups = buildToolGroups({ tier, grants, primary: ops.primary, secondary: ops.secondary, coveringToday: ops.coveringToday });

    const staffing = staffingSummary(snapshot, now);

    // The one shared pulse input every role reads. Built once, from the same
    // recorded facts, so the three dashboards can never disagree.
    const pulseInput: OwnerPulseInput | null = vitals
      ? {
          today,
          todayVitals: vitals.today,
          latest: vitals.latest,
          thisMonth: vitals.thisMonth,
          prevMonth: vitals.prevMonth,
          monthElapsed: vitals.monthElapsed,
          targets: vitals.targets,
          weeklyNewPatientPace: vitals.weeklyNewPatientPace,
          scheduledThisWeek: vitals.scheduledThisWeek,
          scheduledThisWeekRecordedDays: vitals.scheduledThisWeekRecordedDays,
          officePhase: staffing.office.phase,
        }
      : null;

    const goal = buildGoalBrief(sprints, today);

    /* ------------------------------ my work ------------------------------ */
    // A person's own open items, from the records they are party to. The
    // same builder serves the member Home and the admin "Mine" panel.
    const moduleTitles = new Map((modules ?? []).map(m => [m.id, m.title]));
    const mine = buildMyWork({
      today,
      userId: user?.id ?? null,
      employeeId: ctx.employee_id,
      tardies: tardies ?? [],
      incidents: incidents ?? [],
      records: myReports.map(r => ({ id: r.id, status: r.status, kind: r.kind, created_at: r.created_at })),
      bypasses,
      acknowledgments: myAcks,
      training: assignments.map(a => ({ ...a, title: moduleTitles.get(a.module_id) })),
      missingDays: ctx.role === 'owner' ? [] : missingDays,
      openChecklistItems: gating?.incompleteCount ?? 0,
      repliesOwed: messagesCloseout.applies ? messagesCloseout.outstanding.filter(o => o.needs_reply).length : 0,
      ptoRequests: myPto ?? [],
      corrections: (myCorrections ?? []).map(c => ({ id: c.id, status: c.status, created_at: c.created_at, entry_date: typeof c.proposed_change?.entry_date === 'string' ? c.proposed_change.entry_date : null })),
    });

    /* --------------------------- performance --------------------------- */
    // The rows behind the chart, the strip, the goal meters, and the
    // observations — built once, through the same function the design
    // fixtures use. Rows from another office never pass the builder.
    const queryState = (q: { isError: boolean; data: unknown }, fallback: SourceState): SourceState =>
      q.isError ? 'error' : q.data === undefined ? fallback : 'ok';
    const performanceState: PerformanceState = vitalsQuery.isError ? 'error' : vitals === undefined ? 'loading' : 'ok';
    const raw: PerformanceRaw | null = vitals
      ? {
          orgId: vitals.orgId,
          viewerOrgId: ctx.org_id,
          today,
          role: ctx.role,
          days: vitals.days,
          closeoutsState: 'ok',
          reports: reportImports.data ?? null,
          reportState: isAdmin ? queryState(reportImports, 'loading') : 'unauthorized',
          missedEvents: missedEvents.data
            ? missedEvents.data.map(e => ({ business_date: e.business_date, code: e.code, department: e.department }))
            : null,
          missedState: isAdmin ? queryState(missedEvents, 'loading') : 'unauthorized',
          visibility: vitals.visibility,
          thisMonth: vitals.thisMonth,
          targets: vitals.targets,
          monthElapsed: vitals.monthElapsed,
          calendar: officeDays.data ?? null,
        }
      : null;
    const attentionSummary: AttentionSummary | null = isAdmin
      ? {
          enabled: attention.enabled,
          needsNow: attention.counts.needsNow,
          waiting: attention.counts.waiting,
          oldestHours: attention.needsNow.reduce<number | null>((m, i) => (i.ageHours === null ? m : Math.max(m ?? 0, i.ageHours)), null),
          payroll: attention.payrollPeriod?.dueDate && attention.payrollPeriod.dueLabel
            ? { label: attention.payrollPeriod.dueLabel, days: Math.max(0, daysBetween(today, attention.payrollPeriod.dueDate)) }
            : null,
          degraded: attention.degradedSources.length > 0,
        }
      : null;
    const block = performanceBlockFrom({ raw, state: performanceState, pulse: pulseInput, attention: attentionSummary });

    /* ------------------------------ owner ------------------------------ */
    if (ctx.role === 'owner') {
      // Owners are already excluded from `snapshot` at the hook boundary —
      // an owner without punches can never appear absent or out.
      // Decisions are the same list Attention shows — the rows Manager Home shares.
      const decisionCount = attention.counts.needsNow;
      const needs = needsYou(attention);
      const brief = pulseInput ? buildDailyBrief(pulseInput) : null;

      // Operational exceptions: only real, unresolved signals. A zero here is
      // silence, not a row — normal staffing mostly disappears.
      const exceptions: Signal[] = [];
      if (staffing.reviewCount > 0) {
        exceptions.push({
          id: 'attendance-review',
          label: `${staffing.reviewCount} attendance item${staffing.reviewCount === 1 ? '' : 's'} need review`,
          detail: staffing.reviewDetail,
          value: String(staffing.reviewCount),
          href: '/management/people',
          tone: 'attention',
        });
      }

      const today_ = todayBand({ summary: staffing, snapshot, now, needsNow: attention.needsNow, asOf: snapshotQuery.isError ? 'unavailable' : snapshotQuery.data === undefined ? 'loading' : null });
      const lastDay = lastDayLine({
        closeouts: (recentLogs ?? []).map(l => ({ id: l.id, deposit_date: l.deposit_date, sealed_at: l.sealed_at, needs_manager_review: l.needs_manager_review })),
        today, phase: staffing.office.phase, closeDay: closeDayStatus(todayLog ?? null, staffing.office.phase),
      });
      const summary = stateSummary({
        office: staffing.office, today: today_, needs, lastDay,
        payroll: attention.payrollPeriod ? { dueDate: attention.payrollPeriod.dueDate, dueLabel: attention.payrollPeriod.dueLabel } : null,
        payrollItems: attention.needsNow.filter(i => i.payroll).length,
        todayDate: today,
        closeouts: (recentLogs ?? []).map(l => ({ id: l.id, deposit_date: l.deposit_date, sealed_at: l.sealed_at, needs_manager_review: l.needs_manager_review })),
        calendar: officeDays.data ?? null,
      });

      const owner: OwnerView = {
        kind: 'owner',
        header,
        roleContext,
        lanes,
        toolGroups,
        office: staffing.office,
        summary,
        brief,
        lastDay,
        decisionCount,
        needs,
        mine,
        goal,
        staffing,
        exceptions,
        ...block,
      };
      return { view: owner, isLoading: false };
    }

    /* ----------------------------- manager ----------------------------- */
    if (ctx.role === 'manager') {
      const closeDay = closeDayStatus(todayLog ?? null, staffing.office.phase);
      // The pace receipts come from the same layer Owner Home reads.
      const performance = pulseInput && vitals ? monthPaceLines(pulseInput) : null;

      const home = buildHomeBrief({
        attention,
        summary: staffing,
        snapshot,
        now,
        today,
        closeouts: (recentLogs ?? []).map(l => ({ id: l.id, deposit_date: l.deposit_date, sealed_at: l.sealed_at, needs_manager_review: l.needs_manager_review })),
        closeDay,
        pace: performance,
        paceScopeDate: pulseInput?.latest?.date ?? null,
        goal,
        payroll: attention.payrollPeriod ? { dueDate: attention.payrollPeriod.dueDate, dueLabel: attention.payrollPeriod.dueLabel } : null,
        inbox: messagesCloseout.applies ? { outstanding: messagesCloseout.outstanding.length, label: messagesCloseout.label.replace(/ read$/, '') } : null,
        asOf: snapshotQuery.isError ? 'unavailable' : snapshotQuery.data === undefined ? 'loading' : null,
        calendar: officeDays.data ?? null,
      });

      const manager: ManagerView = {
        kind: 'manager',
        header,
        roleContext,
        lanes,
        toolGroups,
        office: staffing.office,
        home,
        brief: pulseInput ? buildDailyBrief(pulseInput) : null,
        mine,
        ...block,
      };
      return { view: manager, isLoading: false };
    }

    /* ----------------------------- member ------------------------------ */
    const punches = todayEntry?.punches ?? [];
    const clockState = getClockStatus(punches);
    const runningMinutes = getRunningMinutes(punches);

    const status =
      clockState === 'clocked_in'
        ? {
            label: 'On the clock',
            detail: `${minutesToHHMM(runningMinutes)} recorded today. Clock out from the bar when you finish.`,
            tone: 'steady' as const,
          }
        : punches.length > 0
          ? {
              label: 'Clocked out',
              detail: `${minutesToHHMM(runningMinutes)} recorded today.`,
              tone: 'calm' as const,
            }
          : {
              label: 'Not clocked in',
              detail: 'Your punches appear here as soon as you clock in.',
              tone: 'calm' as const,
            };

    // Our office pulse: the same rows the owner reads, limited by each
    // metric's own visibility setting (applied by the strip and the meters).
    // A hidden metric simply is not there.
    const sharesAnything = !!vitals && (vitals.visibility.production || vitals.visibility.collections || vitals.visibility.newPatients);
    const workingPhases = ['before_open', 'open', 'unknown_hours'];
    const officePulseNote =
      !sharesAnything || !vitals || vitals.days.length === 0
        ? null
        : workingPhases.includes(staffing.office.phase)
          ? 'Financial figures update after Close the Day — they are not live during the day.'
          : 'From the deposit log, as of the most recent closeout.';

    const rolePulse =
      pulseInput && vitals ? rolePulseItems(ops.primary, pulseInput, vitals.visibility) : [];

    // Where the person stands against the office's late-arrival rule: shown
    // only once a late arrival is on record, and read as "in the last N
    // days", never as a verdict.
    const myLate = (tardies ?? []).filter(t => t.user_id === user?.id && isLiveLateArrival(t));
    let attendanceStanding: MemberView['attendanceStanding'] = null;
    if (lateRule && lateRule.is_active && myLate.length > 0) {
      const standing = standingToday(myLate, lateRule, today);
      attendanceStanding = {
        text: `Late arrivals: ${standingSentence(standing, lateRule)}.`,
        tone: standing.remaining === 0 ? 'attention' : 'calm',
        href: '/days-off',
      };
    }

    // Personal utilities — real, useful, and deliberately not the headline.
    const utilities: Figure[] = [
      {
        id: 'hours',
        value: minutesToHHMM(runningMinutes),
        label: 'Recorded today',
        detail: 'Full history on your timesheet',
        href: '/timesheet',
      },
      {
        id: 'pto',
        value: `${Math.round(pto.balance)}h`,
        label: 'PTO balance',
        detail: pto.tier?.label ?? '',
        href: '/pto',
      },
      {
        id: 'requests',
        value: String(mine.waiting.length),
        label: 'Requests pending',
        detail: mine.waiting.length === 1 ? 'Waiting on a manager' : 'Waiting on a manager',
        href: '/my-requests',
      },
    ];

    const member: MemberView = {
      kind: 'member',
      header,
      roleContext,
      lanes,
      toolGroups,
      work: mine,
      officePulseNote,
      rolePulse,
      goal,
      status,
      utilities,
      attendanceStanding,
      ...block,
    };
    return { view: member, isLoading: false };
  }, [
    ctx, ctxLoading, profile, now, today, snapshot, vitals, todayLog, sprintData,
    bypasses, myReports, myAcks, assignments, modules, pto, todayEntry,
    missingDays, user, ops, grants, attention, recentLogs, messagesCloseout, snapshotQuery.isError, snapshotQuery.data,
    vitalsQuery.isError, reportImports, missedEvents, isAdmin, officeDays.data, tardies, incidents, myPto, myCorrections, gating, lateRule,
  ]);
}
