import { useMemo } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useTick } from '@/hooks/useTick';
import { useOrgAttendanceSnapshot, type EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { useApprovalCounts } from '@/hooks/useApprovalCounts';
import { usePracticeVitals } from '@/hooks/usePracticeVitals';
import { useTeamGoals } from '@/hooks/useTeamGoals';
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
import { getClockStatus, getRunningMinutes } from '@/lib/clock-status';
import { formatDate, formatTime, getToday, minutesToHHMM } from '@/lib/time-utils';
import type {
  DashboardHeader, DashboardView, Figure, ManagerView, MemberView, OwnerView,
  PersonStatus, ProgressRow, Signal, TimelineRow,
} from './types';

/**
 * Composes the EXISTING product hooks into the three role view models.
 *
 * This file adds no queries, no tables, and no business rules — every number
 * below already powers another surface in the app. Anything Purple Envelope
 * cannot verify from real records is simply not rendered.
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

/** One person's live attendance line, in words a human reads at a glance. */
function personStatus(s: EmployeeSnapshot): PersonStatus {
  if (s.office_closed) return { id: s.employee_id, name: s.display_name, status: 'Office closed', tone: 'calm' };
  if (s.has_day_off) return { id: s.employee_id, name: s.display_name, status: 'Approved off', tone: 'calm' };
  if (s.is_absent) return { id: s.employee_id, name: s.display_name, status: 'Out', tone: 'urgent' };
  if (s.is_incomplete) return { id: s.employee_id, name: s.display_name, status: 'No clock-out', tone: 'attention' };
  if (s.is_late)
    return {
      id: s.employee_id,
      name: s.display_name,
      status: `Late ${s.minutes_late}m`,
      tone: 'attention',
    };
  if (s.has_punches)
    return {
      id: s.employee_id,
      name: s.display_name,
      status: s.is_remote ? 'In — remote' : 'In',
      tone: 'steady',
    };
  if (!s.is_scheduled_day)
    return { id: s.employee_id, name: s.display_name, status: 'Not scheduled', tone: 'calm' };
  return { id: s.employee_id, name: s.display_name, status: 'No punch yet', tone: 'attention' };
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
  const { data: sprints = [] } = useTeamGoals();
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

  const today = getToday();
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

    /* ------------------------------ owner ------------------------------ */
    if (ctx.role === 'owner') {
      const scheduled = snapshot.filter(s => s.is_scheduled_day && !s.office_closed && !s.has_day_off);
      const present = scheduled.filter(s => s.has_punches).length;
      const risks = scheduled.filter(s => s.is_absent || s.is_late || (!s.has_punches && s.is_scheduled_day)).length;
      const ownerReviews = orgReports.filter(r => r.status === 'awaiting_owner');
      const overdueAcks = ackRoster.filter(a => !a.acknowledged_at && a.overdue_at);
      const openSprints = sprints.filter(s => s.status === 'active' || s.status === 'pending_verification');
      const verifySprints = sprints.filter(s => s.status === 'pending_verification');
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

      const figures: Figure[] = [
        {
          id: 'decisions',
          value: String(decisionCount),
          label: 'Waiting on you',
          detail: decisionCount === 0 ? 'Clear' : 'Approvals, reviews, signatures',
          href: '/approvals',
        },
        {
          id: 'staffing',
          value: `${present}/${scheduled.length}`,
          label: 'On the floor',
          detail: risks === 0 ? 'No staffing exceptions' : `${risks} exception${risks === 1 ? '' : 's'}`,
          href: '/team',
        },
        {
          id: 'goals',
          value: String(openSprints.length),
          label: 'Goals in flight',
          detail: openSprints.length === 0 ? 'None set' : 'Office sprints running',
          href: '/goals',
        },
        {
          id: 'exceptions',
          value: String(orgReports.filter(r => r.status !== 'closed').length),
          label: 'Open records',
          detail: 'Unresolved accountability chain',
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

      const pulse: Signal[] = [
        {
          id: 'nudges',
          label: 'Open office notes',
          detail: 'Quiet notes the office AI has left, still unresolved.',
          value: String(nudges.length),
          href: '/inbox',
          tone: nudges.length > 0 ? 'attention' : 'calm',
        },
        {
          id: 'missing',
          label: 'Missing punches, last 14 days',
          detail: 'Scheduled days with no time recorded.',
          value: String(snapshot.filter(s => s.is_incomplete).length),
          href: '/team',
          tone: snapshot.some(s => s.is_incomplete) ? 'attention' : 'calm',
        },
      ];

      const owner: OwnerView = {
        kind: 'owner',
        header,
        figures,
        decisions,
        staffing: { present, expected: scheduled.length, rows: scheduled.map(personStatus).slice(0, 10) },
        goals,
        pulse,
        health,
      };
      return { view: owner, isLoading: false };
    }

    /* ----------------------------- manager ----------------------------- */
    if (ctx.role === 'manager') {
      const scheduled = snapshot.filter(s => s.is_scheduled_day && !s.office_closed);
      const present = scheduled.filter(s => s.has_punches).length;
      const late = scheduled.filter(s => s.is_late).length;
      const out = scheduled.filter(s => s.is_absent).length;
      const incomplete = snapshot.filter(s => s.is_incomplete).length;
      const trainingDue = assignments.filter(a => a.status !== 'completed').length;
      const openAcks = ackRoster.filter(a => !a.acknowledged_at).length;
      const managerReviews = orgReports.filter(r => r.status === 'awaiting_manager');

      const figures: Figure[] = [
        {
          id: 'here',
          value: `${present}/${scheduled.length}`,
          label: 'Here now',
          detail: late > 0 ? `${late} late` : 'No late arrivals',
          tone: late > 0 ? 'attention' : 'steady',
          href: '/team',
        },
        {
          id: 'out',
          value: String(out),
          label: 'Out today',
          detail: 'Coverage gaps',
          tone: out > 0 ? 'attention' : 'calm',
          href: '/team',
        },
        {
          id: 'approvals',
          value: String(approvals?.total ?? 0),
          label: 'Approvals',
          detail: 'PTO, corrections, changes',
          tone: (approvals?.total ?? 0) > 0 ? 'attention' : 'calm',
          href: '/approvals',
        },
        {
          id: 'punches',
          value: String(incomplete),
          label: 'Missing clock-outs',
          detail: 'Days that need fixing',
          tone: incomplete > 0 ? 'urgent' : 'calm',
          href: '/team',
        },
      ];

      const attention: Signal[] = [
        {
          id: 'pto',
          label: 'PTO requests pending',
          detail: 'Approve or decline before the schedule locks.',
          value: String(approvals?.ptoRequests ?? 0),
          href: '/approvals',
          tone: (approvals?.ptoRequests ?? 0) > 0 ? 'attention' : 'calm',
        },
        {
          id: 'corrections',
          label: 'Time corrections pending',
          detail: 'Each one keeps the original punch on record.',
          value: String(approvals?.corrections ?? 0),
          href: '/approvals',
          tone: (approvals?.corrections ?? 0) > 0 ? 'attention' : 'calm',
        },
        {
          id: 'reviews',
          label: 'Records awaiting your review',
          detail: 'Accountability chain — you cannot review your own.',
          value: String(managerReviews.length),
          href: '/management',
          tone: managerReviews.length > 0 ? 'urgent' : 'calm',
        },
        {
          id: 'acks',
          label: 'Unsigned policy acknowledgments',
          detail: 'Exact published versions still unsigned.',
          value: String(openAcks),
          href: '/playbook',
          tone: openAcks > 0 ? 'attention' : 'calm',
        },
        {
          id: 'training',
          label: 'Training assignments open',
          detail: 'Assigned modules not yet completed.',
          value: String(trainingDue),
          href: '/training',
          tone: trainingDue > 0 ? 'attention' : 'calm',
        },
        {
          id: 'nudges',
          label: 'Unresolved office notes',
          detail: 'Nudges nobody has acted on or dismissed.',
          value: String(nudges.length),
          href: '/inbox',
          tone: nudges.length > 0 ? 'attention' : 'calm',
        },
      ];

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

      const timeline: TimelineRow[] = scheduled
        .filter(s => s.has_punches || s.is_late || s.is_absent)
        .slice(0, 12)
        .map(s => {
          const p = personStatus(s);
          return {
            id: s.employee_id,
            time: s.is_late ? `+${s.minutes_late}m` : s.has_punches ? 'In' : '—',
            label: s.display_name,
            detail: p.status,
            tone: p.tone,
          };
        });

      const manager: ManagerView = {
        kind: 'manager',
        header,
        figures,
        roster: scheduled.map(personStatus),
        attention,
        progress,
        timeline,
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
                    href: '/my-time',
                    cta: 'Review time',
                  }
                : null;

    const mine: Signal[] = [
      {
        id: 'training',
        label: 'Training assigned to me',
        detail: 'Modules not yet completed.',
        value: String(openTraining.length),
        href: '/training',
        tone: openTraining.length > 0 ? 'attention' : 'calm',
      },
      {
        id: 'acks',
        label: 'Policies to sign',
        detail: 'Signing means you read that exact version.',
        value: String(openAcks.length),
        href: '/playbook',
        tone: openAcks.length > 0 ? 'attention' : 'calm',
      },
      {
        id: 'bypasses',
        label: 'Bypass reasons owed',
        detail: 'Never blocks you — just needs a sentence.',
        value: String(bypasses.length),
        href: '/checklists',
        tone: bypasses.length > 0 ? 'attention' : 'calm',
      },
      {
        id: 'missing',
        label: 'Missing time, last 14 days',
        detail: 'Scheduled days with no punches.',
        value: String(missingDays.length),
        href: '/my-time',
        tone: missingDays.length > 0 ? 'attention' : 'calm',
      },
      {
        id: 'records',
        label: 'Records awaiting my response',
        detail: 'You always get to add your side.',
        value: String(openReports.length),
        href: '/management',
        tone: openReports.length > 0 ? 'urgent' : 'calm',
      },
    ].filter(s => s.value !== '0' || s.id === 'training');

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
        href: '/my-time',
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

    const office: Signal[] = [
      {
        id: 'sprints',
        label: 'Office sprints running',
        detail: 'Shared goals you can contribute to.',
        value: String(mySprints.length),
        href: '/goals',
        tone: 'calm',
      },
      {
        id: 'nudges',
        label: 'Notes for you',
        detail: 'Quiet suggestions, always yours to dismiss.',
        value: String(nudges.length),
        href: '/inbox',
        tone: nudges.length > 0 ? 'attention' : 'calm',
      },
    ];

    const member: MemberView = {
      kind: 'member',
      header,
      status,
      next,
      mine,
      progress,
      figures,
      office,
    };
    return { view: member, isLoading: false };
  }, [
    ctx, ctxLoading, profile, now, today, snapshot, approvals, vitals, sprints, nudges, bypasses,
    orgReports, myReports, ackRoster, myAcks, assignments, pto, momentum, todayEntry, missingDays, user,
  ]);
}
