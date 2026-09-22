import { useMemo } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useTick } from '@/hooks/useTick';
import { useOrgAttendanceSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { usePracticeVitals } from '@/hooks/usePracticeVitals';
import { useDepositLog, useRecentDepositLogs } from '@/hooks/useDepositLog';
import { useTeamGoals, type TeamGoal } from '@/hooks/useTeamGoals';
import { useUnresolvedBypasses } from '@/hooks/useChecklistBypasses';
import { useMyAccountabilityReports } from '@/hooks/useAccountability';
import { useMyKnowledgeAcknowledgments } from '@/hooks/useKnowledgeAcknowledgments';
import { useTrainingAssignments } from '@/hooks/useTraining';
import { useCurrentPtoBalance } from '@/hooks/usePtoEngine';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { useTodayEntry } from '@/hooks/useTimeEntries';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useMessagesCloseout } from '@/hooks/useMessagesCloseout';
import { buildHomeBrief } from '@/lib/home-brief';
import { useAuth } from '@/hooks/useAuth';
import { useMyOperationalRoles } from '@/hooks/useMyOperationalRoles';
import { useMyPermissionGrants } from '@/hooks/useEmployeePermissions';
import { shortcutsFor, roleLabel as opRoleLabel, roleMission } from './opRoles';
import { getClockStatus, getRunningMinutes } from '@/lib/clock-status';
import { formatDate, formatTime, getToday, minutesToHHMM } from '@/lib/time-utils';
import { staffingSummary } from './staffing';
import {
  buildDailyBrief, buildGoalBrief, buildMonthDetail, dailySummary, monthPaceLines,
  ownerRecommendation, type OwnerPulseInput,
} from '@/lib/owner-pulse';
import { closeDayStatus } from '@/lib/manager-pulse';
import { memberOfficeLines, rolePulseItems } from '@/lib/member-pulse';
import type {
  DashboardHeader, DashboardView, Figure, ManagerView, MemberView, OwnerView,
  PermissionTier, RoleContext, RoleLane, Signal,
} from './types';

/**
 * Composes the EXISTING product hooks into the three role view models.
 *
 * This file adds no queries beyond the product's own hooks, no tables, and no
 * business rules — the pulse math lives in the shared deterministic layer
 * (owner-pulse.ts / manager-pulse.ts / member-pulse.ts on top of
 * metric-pace.ts), so Owner, Manager, and Team read the SAME calculations.
 * Anything Purple Envelope cannot verify from real records is not rendered.
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

export function useDashboardView(): { view: DashboardView | null; isLoading: boolean } {
  const now = useTick(60_000);
  const { user } = useAuth();
  const { data: ctx, isLoading: ctxLoading } = useOrgContext();
  const { data: profile } = useMyProfile();

  // Shared / admin sources (each hook disables itself when the role is wrong).
  const snapshotQuery = useOrgAttendanceSnapshot();
  const snapshot = snapshotQuery.data ?? [];
  const { data: vitals } = usePracticeVitals();
  const today = getToday();
  const { data: todayLog } = useDepositLog(today);
  const { data: recentLogs } = useRecentDepositLogs(14);
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
  const pto = useCurrentPtoBalance();
  const { data: todayEntry } = useTodayEntry();

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
     * Operational-role lanes. The primary role gets a full lane; backup roles
     * get a compact "Also covering" strip, and only contribute time-sensitive
     * items when they are actually covering that function today. A secondary
     * role never merges a second whole dashboard in, and never widens
     * permission — `shortcutsFor` filters by tier.
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
        // The primary lane never repeats a line already shown above in the
        // member's own open-items list — one item, one place.
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

    /* ------------------------------ owner ------------------------------ */
    if (ctx.role === 'owner') {
      // Owners are already excluded from `snapshot` at the hook boundary —
      // an owner without punches can never appear absent or out.
      // Decisions are the same list Attention shows, top three, one
      // navigation action each. No count is computed here.
      const decisionCount = attention.counts.needsNow;
      const decisions: Signal[] = attention.needsNow.slice(0, 3).map(i => ({
        id: i.key,
        label: `${i.subject.name ? `${i.subject.name} · ` : ''}${i.label}`,
        detail: i.deadline ? i.deadline.label : i.verb === 'decide' ? 'Waiting on your decision' : i.verb === 'fix' ? 'A record to fix' : 'Follow-up the office rule asks for',
        value: '',
        href: `/management?item=${i.key}`,
        tone: i.coverage ? 'urgent' : 'attention',
      }));

      // The daily pulse is a pure function of recorded vitals. While the
      // query is in flight everything stays null — the hero renders a quiet
      // loading line instead of fabricated zeros.
      let summary: string | null = null;
      let brief: OwnerView['brief'] = null;
      let lookAt: OwnerView['lookAt'] = null;
      let month: OwnerView['month'] = null;
      if (pulseInput && vitals) {
        brief = buildDailyBrief(pulseInput);
        lookAt = ownerRecommendation(pulseInput, sprints);
        summary = dailySummary(pulseInput, brief, decisionCount);
        month = buildMonthDetail(pulseInput, vitals.months);
      }

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

      const owner: OwnerView = {
        kind: 'owner',
        header,
        roleContext,
        lanes,
        office: staffing.office,
        summary,
        brief,
        lookAt,
        decisionCount,
        decisions,
        goal,
        month,
        staffing,
        exceptions,
      };
      return { view: owner, isLoading: false };
    }

    /* ----------------------------- manager ----------------------------- */
    if (ctx.role === 'manager') {
      const closeDay = closeDayStatus(todayLog ?? null, staffing.office.phase);
      // The pace receipts come from the same layer Owner Home reads.
      const performance = pulseInput && vitals ? monthPaceLines(pulseInput) : null;
      // What needs the manager personally, never the office's work.
      const myOpenAcks = myAcks.filter(a => !a.acknowledged_at);
      const myOpenReports = myReports.filter(r => r.status === 'awaiting_member');
      const mineAll: Signal[] = [
        { id: 'acks', label: 'Policies to sign', detail: 'Signing means you read that exact version.', value: String(myOpenAcks.length), href: '/playbook', tone: 'attention' },
        { id: 'missing', label: 'Missing time of my own, last 14 days', detail: 'Scheduled days with no punches.', value: String(missingDays.length), href: '/timesheet', tone: 'attention' },
        { id: 'bypasses', label: 'Bypass reasons I owe', detail: 'Never blocks you — just needs a sentence.', value: String(bypasses.length), href: '/checklists', tone: 'attention' },
        { id: 'records', label: 'Records awaiting my response', detail: 'You always get to add your side.', value: String(myOpenReports.length), href: '/', tone: 'urgent' },
      ];
      const mine = mineAll.filter(s => s.value !== '0');

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
      });

      const manager: ManagerView = {
        kind: 'manager',
        header,
        roleContext,
        lanes,
        office: staffing.office,
        home,
        mine,
      };
      return { view: manager, isLoading: false };
    }

    /* ----------------------------- member ------------------------------ */
    const punches = todayEntry?.punches ?? [];
    const clockState = getClockStatus(punches);
    const runningMinutes = getRunningMinutes(punches);
    const openTraining = assignments.filter(a => a.assigned_to === user?.id && a.status !== 'completed');
    const openAcks = myAcks.filter(a => !a.acknowledged_at);
    const openReports = myReports.filter(r => r.status === 'awaiting_member');

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

    const next =
      openReports.length > 0
        ? {
            title: 'Sign your record',
            detail: 'A record is waiting on your response before it moves on.',
            href: '/',
            cta: 'Open record',
          }
        : bypasses.length > 0
          ? {
              title: 'Add a bypass reason',
              detail: 'You clocked out past a checklist. A short reason closes it.',
              href: '/checklists',
              cta: 'Add reason',
            }
          : openAcks.length > 0
            ? {
                title: 'Read and sign a policy',
                detail: 'A published version is assigned to you.',
                href: '/playbook',
                cta: 'Open playbook',
              }
            : openTraining.length > 0
              ? {
                  title: 'Finish your training',
                  detail: `${openTraining.length} module${openTraining.length === 1 ? '' : 's'} assigned to you.`,
                  href: '/training',
                  cta: 'Open training',
                }
              : missingDays.length > 0
                ? {
                    title: 'Explain a missing day',
                    detail: `${missingDays.length} scheduled day${missingDays.length === 1 ? '' : 's'} with no time recorded.`,
                    href: '/timesheet',
                    cta: 'Review time',
                  }
                : null;

    const mineAll: Signal[] = [
      {
        id: 'training',
        label: 'Training assigned to me',
        detail: 'Modules not yet completed.',
        value: String(openTraining.length),
        href: '/training',
        tone: 'attention',
      },
      {
        id: 'acks',
        label: 'Policies to sign',
        detail: 'Signing means you read that exact version.',
        value: String(openAcks.length),
        href: '/playbook',
        tone: 'attention',
      },
      {
        id: 'bypasses',
        label: 'Bypass reasons owed',
        detail: 'Never blocks you — just needs a sentence.',
        value: String(bypasses.length),
        href: '/checklists',
        tone: 'attention',
      },
      {
        id: 'missing',
        label: 'Missing time, last 14 days',
        detail: 'Scheduled days with no punches.',
        value: String(missingDays.length),
        href: '/timesheet',
        tone: 'attention',
      },
      {
        id: 'records',
        label: 'Records awaiting my response',
        detail: 'You always get to add your side.',
        value: String(openReports.length),
        href: '/',
        tone: 'urgent',
      },
    ];
    // A zero is not an open item. The empty state says "you're clear" once,
    // instead of five rows of zeros saying it five times.
    const mine = mineAll.filter(s => s.value !== '0');

    // Our Office Pulse: the canonical month lines, filtered per-metric by the
    // office's visibility settings. A hidden metric simply is not here.
    const officePulse =
      pulseInput && vitals ? memberOfficeLines(pulseInput, vitals.visibility) : [];
    const workingPhases = ['before_open', 'open', 'unknown_hours'];
    const officePulseNote =
      officePulse.length === 0
        ? null
        : workingPhases.includes(staffing.office.phase)
          ? 'Financial figures update after Close the Day — they are not live during the day.'
          : 'From the deposit log, as of the most recent closeout.';

    const rolePulse =
      pulseInput && vitals ? rolePulseItems(ops.primary, pulseInput, vitals.visibility) : [];

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
        id: 'timesheet',
        value: '→',
        label: 'Timesheet',
        detail: 'Punches, corrections, week totals',
        href: '/timesheet',
      },
    ];

    const member: MemberView = {
      kind: 'member',
      header,
      roleContext,
      lanes,
      next,
      officePulse,
      officePulseNote,
      rolePulse,
      mine,
      goal,
      status,
      utilities,
    };
    return { view: member, isLoading: false };
  }, [
    ctx, ctxLoading, profile, now, today, snapshot, vitals, todayLog, sprintData,
    bypasses, myReports, myAcks, assignments, pto, todayEntry,
    missingDays, user, ops, grants, attention, recentLogs, messagesCloseout, snapshotQuery.isError, snapshotQuery.data,
  ]);
}
