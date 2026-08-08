import { useMemo } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useTick } from '@/hooks/useTick';
import { useOrgAttendanceSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';
import { usePracticeVitals } from '@/hooks/usePracticeVitals';
import { useTeamGoals, type TeamGoal } from '@/hooks/useTeamGoals';
import { useOfficeNudges } from '@/hooks/useOfficeNudges';
import { useUnresolvedBypasses } from '@/hooks/useChecklistBypasses';
import { useOrgAccountabilityReports, useMyAccountabilityReports } from '@/hooks/useAccountability';
import {
  useKnowledgeAcknowledgmentRoster,
  useMyKnowledgeAcknowledgments,
} from '@/hooks/useKnowledgeAcknowledgments';
import { useTrainingAssignments } from '@/hooks/useTraining';
import { useCurrentPtoBalance } from '@/hooks/usePtoEngine';
import { useMomentum } from '@/hooks/useMomentum';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { useTodayEntry } from '@/hooks/useTimeEntries';
import { useAuth } from '@/hooks/useAuth';
import { useMyOperationalRoles } from '@/hooks/useMyOperationalRoles';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { shortcutsFor, roleLabel as opRoleLabel, roleMission } from './opRoles';
import { calculatePunchMinutes } from '@/lib/time-utils';
import { getClockStatus, getRunningMinutes } from '@/lib/clock-status';
import { formatDate, formatTime, getToday, minutesToHHMM, shiftDate } from '@/lib/time-utils';
import { staffingSummary } from './staffing';
import type {
  DashboardHeader, DashboardView, Figure, ManagerView, MemberView, OwnerView,
  PermissionTier, ProgressRow, RoleContext, RoleLane, Series, Signal,
} from './types';

/**
 * Composes the EXISTING product hooks into the three role view models.
 *
 * This file adds no queries, no tables, and no business rules — every number
 * below already powers another surface in the app. Anything Purple Envelope
 * cannot verify from real records is simply not rendered.
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

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

const TIER_OF: Record<'owner' | 'manager' | 'employee', PermissionTier> = {
  owner: 'owner',
  manager: 'manager',
  employee: 'member',
};

/** Short weekday label for chart columns. */
function dayTick(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' });
}

export function useDashboardView(): { view: DashboardView | null; isLoading: boolean } {
  const now = useTick(60_000);
  const { user } = useAuth();
  const { data: ctx, isLoading: ctxLoading } = useOrgContext();
  const { data: profile } = useMyProfile();

  // Shared / admin sources (each hook disables itself when the role is wrong).
  const { data: snapshot = [] } = useOrgAttendanceSnapshot();
  const { data: approvals } = useApprovalCounts();
  const { data: vitals } = usePracticeVitals();
  const { data: sprintData } = useTeamGoals();
  const sprints: TeamGoal[] = sprintData?.live ?? [];
  const { data: nudges = [] } = useOfficeNudges();
  const { data: bypasses = [] } = useUnresolvedBypasses();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  const { data: orgReports = [] } = useOrgAccountabilityReports(isAdmin);
  const { data: myReports = [] } = useMyAccountabilityReports();
  const { data: ackRoster = [] } = useKnowledgeAcknowledgmentRoster();
  const { data: myAcks = [] } = useMyKnowledgeAcknowledgments();
  const { data: assignments = [] } = useTrainingAssignments();
  const pto = useCurrentPtoBalance();
  const { data: momentum } = useMomentum();
  const { data: todayEntry } = useTodayEntry();

  const ops = useMyOperationalRoles();
  const today = getToday();
  const weekStart = shiftDate(today, -6);
  const { data: weekEntries = [] } = useTimeEntries(weekStart, today);
  const fourteenDaysAgo = new Date(new Date(today + 'T12:00:00Z').getTime() - 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const missingDays = useMissingShifts(fourteenDaysAgo);

  return useMemo(() => {
    if (!ctx) return { view: null, isLoading: ctxLoading };

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
      const usesChecklists = shortcutsFor(role, tier).some(sc => sc.to === '/checklists');
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
        shortcuts: shortcutsFor(ops.primary, tier),
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
        shortcuts: shortcutsFor(role, tier).slice(0, 4),
        urgent: covering ? laneUrgent(role) : [],
        covering,
        note: covering ? 'Also covering today' : 'Backup — can cover, not assigned',
      });
    }

    /**
     * The member's personal chart, from their own `time_entries` punches.
     * The office arrivals trend intentionally does NOT live on Home — it is an
     * attendance surface an admin opens on purpose, from Team.
     */
    const mySeries: Series = {
      id: 'my-week',
      title: 'My recorded time, last 7 days',
      question: 'How is my week tracking?',
      caption: 'Hours from your own punches. Corrections are reflected once approved.',
      href: '/timesheet',
      format: 'hours',
      points: Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i)).map(d => {
        const entry = weekEntries.find(e => e.entry_date === d);
        const mins = entry ? calculatePunchMinutes(entry.punches ?? []) : 0;
        return { x: dayTick(d), value: Math.round((mins / 60) * 10) / 10, muted: mins === 0 };
      }),
    };

    /* ------------------------------ owner ------------------------------ */
    if (ctx.role === 'owner') {
      // Owners are already excluded from `snapshot` at the hook boundary —
      // an owner without punches can never appear absent or out.
      const staffing = staffingSummary(snapshot, now);
      const ownerReviews = orgReports.filter(r => r.status === 'awaiting_owner');
      const overdueAcks = ackRoster.filter(a => !a.acknowledged_at && a.overdue_at);
      const openSprints = sprints.filter(s => s.status === 'active' || s.status === 'pending_verification');
      const verifySprints = sprints.filter(s => s.status === 'pending_verification');
      const openRecords = orgReports.filter(r => r.status !== 'closed').length;
      const decisionCount =
        (approvals?.total ?? 0) + ownerReviews.length + overdueAcks.length + verifySprints.length;

      const decisions: Signal[] = [
        {
          id: 'approvals',
          label: 'Approvals pending',
          detail: `${approvals?.ptoRequests ?? 0} PTO · ${approvals?.corrections ?? 0} corrections · ${approvals?.changeRequests ?? 0} changes`,
          value: String(approvals?.total ?? 0),
          href: '/approvals',
          tone: (approvals?.total ?? 0) > 0 ? 'attention' : 'calm',
        },
        {
          id: 'reviews',
          label: 'Accountability records at owner review',
          detail: 'Nobody reviews their own record — these have reached you.',
          value: String(ownerReviews.length),
          href: '/management',
          tone: ownerReviews.length > 0 ? 'urgent' : 'calm',
        },
        {
          id: 'acks',
          label: 'Policy acknowledgments overdue',
          detail: 'Published versions still unsigned past their due date.',
          value: String(overdueAcks.length),
          href: '/playbook',
          tone: overdueAcks.length > 0 ? 'attention' : 'calm',
        },
        {
          id: 'verify',
          label: 'Sprints awaiting verification',
          detail: 'Wins that need a second pair of eyes before they count.',
          value: String(verifySprints.length),
          href: '/goals',
          tone: verifySprints.length > 0 ? 'attention' : 'calm',
        },
      ];

      // At-a-glance strip: STATUS only. Detail and actions live in the bands
      // below, so a number never repeats with the same meaning twice. The
      // staffing tile exists only while staffing is a live question — when
      // the office is closed, the Office Status card already says so once.
      const staffingFigures: Figure[] =
        staffing.office.phase === 'open'
          ? [
              {
                id: 'staffing',
                value: `${staffing.presentNow ?? 0}/${staffing.expectedNow ?? 0}`,
                label: 'In right now',
                detail: (staffing.missingNow ?? 0) > 0 ? `${staffing.missingNow} not in yet` : 'As expected',
                tone: (staffing.missingNow ?? 0) > 0 ? 'attention' : 'steady',
                href: '/team',
              },
            ]
          : staffing.office.phase === 'unknown_hours'
            ? [
                {
                  id: 'staffing',
                  value: String(staffing.scheduledToday),
                  label: 'Scheduled today',
                  detail: 'Shift times not set',
                  href: '/team',
                },
              ]
            : [];

      const glance: Figure[] = [
        ...staffingFigures,
        {
          id: 'goals',
          value: openSprints.length > 0 ? String(openSprints.length) : '—',
          label: 'Goals in flight',
          detail: openSprints.length > 0 ? 'Office sprints running' : 'None running yet',
          href: '/goals',
        },
        {
          id: 'records',
          value: openRecords > 0 ? String(openRecords) : '0',
          label: 'Open records',
          detail: openRecords > 0 ? 'Accountability in progress' : 'All resolved',
          href: '/management',
        },
      ];

      const goals: ProgressRow[] = openSprints.slice(0, 4).map(s => ({
        id: s.id,
        label: s.title,
        done: Math.min(s.progress, s.target_count),
        total: s.target_count,
        detail: `${s.metric} · ends ${formatDate(s.ends_on)}${s.status === 'pending_verification' ? ' · awaiting verification' : ''}`,
        href: '/goals',
      }));

      const health =
        vitals && vitals.visible && vitals.targetCents > 0 && vitals.thisMonthDays.length > 0
          ? {
              collectedLabel: money(vitals.thisMonth.collectedCents),
              paceLabel:
                vitals.thisMonth.collectedCents >= vitals.pacedTargetCents
                  ? `Ahead of a ${money(vitals.pacedTargetCents)} pace`
                  : `Behind a ${money(vitals.pacedTargetCents)} pace`,
              pacePct:
                vitals.targetCents > 0
                  ? (vitals.thisMonth.collectedCents / vitals.targetCents) * 100
                  : 0,
              disruptions: vitals.thisMonth.disruptions,
              days: vitals.thisMonthDays.length,
            }
          : null;

      // Office pulse: only real, unresolved signals. A zero here is silence,
      // not a row — the band renders a calm "all quiet" state instead.
      const pulse: Signal[] = [];
      if (nudges.length > 0) {
        pulse.push({
          id: 'nudges',
          label: 'Unresolved office notes',
          detail: 'Notes Purple Envelope flagged, still open.',
          value: String(nudges.length),
          href: '/inbox',
          tone: 'attention',
        });
      }
      if (staffing.reviewCount > 0) {
        pulse.push({
          id: 'attendance-review',
          label: `${staffing.reviewCount} attendance item${staffing.reviewCount === 1 ? '' : 's'} need review`,
          detail: staffing.reviewDetail,
          value: String(staffing.reviewCount),
          href: '/team',
          tone: 'attention',
        });
      }

      const owner: OwnerView = {
        kind: 'owner',
        header,
        roleContext,
        lanes,
        office: staffing.office,
        decisionCount,
        decisions,
        glance,
        staffing,
        goals,
        pulse,
        health,
      };
      return { view: owner, isLoading: false };
    }

    /* ----------------------------- manager ----------------------------- */
    if (ctx.role === 'manager') {
      const staffing = staffingSummary(snapshot, now);
      const trainingDue = assignments.filter(a => a.status !== 'completed').length;
      const openAcks = ackRoster.filter(a => !a.acknowledged_at).length;
      const managerReviews = orgReports.filter(r => r.status === 'awaiting_manager');

      const approvalsFigure: Figure = {
        id: 'approvals',
        value: String(approvals?.total ?? 0),
        label: 'Approvals',
        detail: (approvals?.total ?? 0) > 0 ? 'PTO, corrections, changes' : 'Queue is clear',
        tone: (approvals?.total ?? 0) > 0 ? 'attention' : 'calm',
        href: '/approvals',
      };
      const reviewFigure: Figure = {
        id: 'attendance-review',
        value: String(staffing.reviewCount),
        label: 'Attendance to review',
        detail: staffing.reviewCount > 0 ? staffing.reviewDetail : 'Nothing needs review',
        tone: staffing.reviewCount > 0 ? 'attention' : 'calm',
        href: '/team',
      };

      // The figure strip answers the question that matches the time of day:
      // live staffing while the office works, a day summary when it does not.
      const figures: Figure[] =
        staffing.office.phase === 'open'
          ? [
              {
                id: 'here',
                value: `${staffing.presentNow ?? 0}/${staffing.expectedNow ?? 0}`,
                label: 'In right now',
                detail: 'Against who is expected at this hour',
                tone: 'steady',
                href: '/team',
              },
              {
                id: 'not-in',
                value: String(staffing.missingNow ?? 0),
                label: 'Not in yet',
                detail: (staffing.missingNow ?? 0) > 0 ? 'Expected now, no punch' : 'Everyone expected is in',
                tone: (staffing.missingNow ?? 0) > 0 ? 'attention' : 'calm',
                href: '/team',
              },
              approvalsFigure,
              reviewFigure,
            ]
          : staffing.office.phase === 'before_open'
            ? [
                { id: 'office', value: '—', label: 'Office', detail: staffing.office.detail, tone: 'calm', href: '/team' },
                {
                  id: 'scheduled',
                  value: String(staffing.scheduledToday),
                  label: 'Scheduled today',
                  detail: 'Shifts on the calendar',
                  tone: 'calm',
                  href: '/team',
                },
                approvalsFigure,
                reviewFigure,
              ]
            : staffing.office.phase === 'unknown_hours'
              ? [
                  {
                    id: 'scheduled',
                    value: String(staffing.scheduledToday),
                    label: 'Scheduled today',
                    detail: 'Shift times not set',
                    tone: 'calm',
                    href: '/team',
                  },
                  {
                    id: 'punched',
                    value: String(snapshot.filter(s => s.has_punches).length),
                    label: 'Punched in today',
                    detail: 'Recorded time today',
                    tone: 'calm',
                    href: '/team',
                  },
                  approvalsFigure,
                  reviewFigure,
                ]
              : [
                  { id: 'office', value: 'Closed', label: 'Office', detail: staffing.office.detail, tone: 'calm' },
                  {
                    id: 'worked',
                    value: String(snapshot.filter(s => s.has_punches).length),
                    label: 'Worked today',
                    detail: staffing.scheduledToday > 0 ? `${staffing.scheduledToday} scheduled` : 'No shifts today',
                    tone: 'calm',
                    href: '/team',
                  },
                  approvalsFigure,
                  reviewFigure,
                ];

      const attentionAll: Signal[] = [
        {
          id: 'pto',
          label: 'PTO requests pending',
          detail: 'Approve or decline before the schedule locks.',
          value: String(approvals?.ptoRequests ?? 0),
          href: '/approvals',
          tone: 'attention',
        },
        {
          id: 'corrections',
          label: 'Time corrections pending',
          detail: 'Each one keeps the original punch on record.',
          value: String(approvals?.corrections ?? 0),
          href: '/approvals',
          tone: 'attention',
        },
        {
          id: 'reviews',
          label: 'Records awaiting your review',
          detail: 'Accountability chain — you cannot review your own.',
          value: String(managerReviews.length),
          href: '/management',
          tone: 'urgent',
        },
        {
          id: 'acks',
          label: 'Unsigned policy acknowledgments',
          detail: 'Exact published versions still unsigned.',
          value: String(openAcks),
          href: '/playbook',
          tone: 'attention',
        },
        {
          id: 'training',
          label: 'Training assignments open',
          detail: 'Assigned modules not yet completed.',
          value: String(trainingDue),
          href: '/training',
          tone: 'attention',
        },
        {
          id: 'nudges',
          label: 'Unresolved office notes',
          detail: 'Notes Purple Envelope flagged, still open.',
          value: String(nudges.length),
          href: '/inbox',
          tone: 'attention',
        },
      ];
      const attention = attentionAll.filter(s => s.value !== '0');

      const progress: ProgressRow[] = sprints
        .filter(s => s.status === 'active')
        .slice(0, 4)
        .map(s => ({
          id: s.id,
          label: s.title,
          done: Math.min(s.progress, s.target_count),
          total: s.target_count,
          detail: `${s.metric} · ends ${formatDate(s.ends_on)}`,
          href: '/goals',
        }));

      const manager: ManagerView = {
        kind: 'manager',
        header,
        roleContext,
        lanes,
        office: staffing.office,
        figures,
        staffing,
        attention,
        progress,
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
    const mySprints = sprints.filter(s => s.status === 'active');

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
            href: '/management',
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
        href: '/management',
        tone: 'urgent',
      },
    ];
    // A zero is not an open item. The empty state says "you're clear" once,
    // instead of five rows of zeros saying it five times.
    const mine = mineAll.filter(s => s.value !== '0');

    const progress: ProgressRow[] = mySprints.slice(0, 3).map(s => ({
      id: s.id,
      label: s.title,
      done: Math.min(s.progress, s.target_count),
      total: s.target_count,
      detail: `${s.metric} · ends ${formatDate(s.ends_on)}`,
      href: '/goals',
    }));

    const figures: Figure[] = [
      {
        id: 'streak',
        value: String(momentum?.streak ?? 0),
        label: 'Day streak',
        detail: momentum?.pausedToday ? 'Paused today' : 'Verified records only',
      },
      {
        id: 'hours',
        value: minutesToHHMM(runningMinutes),
        label: 'Today',
        detail: 'Recorded time',
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
        id: 'open',
        value: String(openTraining.length + openAcks.length + bypasses.length),
        label: 'Open items',
        detail: 'Assigned to you',
      },
    ];

    const office: Signal[] = [];
    if (mySprints.length > 0) {
      office.push({
        id: 'sprints',
        label: 'Office sprints running',
        detail: 'Shared goals you can contribute to.',
        value: String(mySprints.length),
        href: '/goals',
        tone: 'calm',
      });
    }
    if (nudges.length > 0) {
      office.push({
        id: 'nudges',
        label: 'Notes for you',
        detail: 'Quiet suggestions, always yours to dismiss.',
        value: String(nudges.length),
        href: '/inbox',
        tone: 'attention',
      });
    }

    const member: MemberView = {
      kind: 'member',
      header,
      roleContext,
      chart: mySeries,
      lanes,
      status,
      next,
      mine,
      progress,
      figures,
      office,
    };
    return { view: member, isLoading: false };
  }, [
    ctx, ctxLoading, profile, now, today, snapshot, approvals, vitals, sprintData, sprints, nudges, bypasses,
    orgReports, myReports, ackRoster, myAcks, assignments, pto, momentum, todayEntry, missingDays, user,
    ops, weekEntries, weekStart,
  ]);
}
