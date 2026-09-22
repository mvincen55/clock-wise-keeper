import { useEffect, useRef } from 'react';
import { getToday } from '@/lib/time-utils';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { MissingShiftBanner } from '@/components/MissingShiftBanner';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useConsumedSearchParam } from '@/hooks/useDeepLink';
import TodayFocusCard from '@/components/copilot/TodayFocusCard';
import MessagesCloseoutCard from '@/components/MessagesCloseoutCard';
import SprintCard from '@/components/SprintCard';
import MyMomentumCard from '@/components/MyMomentumCard';
import MyAccountabilityCard from '@/components/accountability/MyAccountabilityCard';
import UserNotesBoard from '@/components/UserNotesBoard';
import FirstGoalTaskCard from '@/components/goals/FirstGoalTaskCard';
import HomeNudges from '@/components/nudges/HomeNudges';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import { useDashboardView } from '@/components/dashboard/useDashboardView';
import { MicroLabel } from '@/components/dashboard/kit';

/**
 * Home — three role experiences, one product family.
 *
 * The top composition is the role command center (a view into existing hooks).
 * Below it sits deliberately EDITED working detail: each tier gets only the
 * interactive surfaces that tier actually works, under a named section — never
 * a generic "Detail" dump of every card, and never a second copy of something
 * the command center already answered.
 *
 * The manager's Home is a briefing (design §3.3): the doctor board, Today
 * Focus, Rescope, the sprint card, and the notes board live with their owners
 * now (Playbook, Office → Goals & challenges, Workplace). Only the record
 * that can be signed nowhere else — the manager's own accountability record —
 * still renders here, and only when one exists.
 *
 * Deep links (`?record=`, `?sprint=`) still land on their card: if a tier does
 * not normally show that card, the link forces it in and scrolls to it.
 */

/** A named band of working surfaces. Reads as a section, not a card grid. */
function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 border-foreground pt-4">
        <MicroLabel>{label}</MicroLabel>
        {hint && <p className="text-[12.5px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Scrolls a deep-linked card into view once, without changing its behaviour. */
function DeepLinked({ active, children }: { active: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    return () => clearTimeout(t);
  }, [active]);
  return <div ref={ref}>{children}</div>;
}

export default function Home() {
  const { data: ctx } = useOrgContext();
  const { view } = useDashboardView();

  const linkedRecordId = useConsumedSearchParam('record');
  const linkedSprintId = useConsumedSearchParam('sprint');

  const todayKey = getToday();
  const fourteenDaysAgo = new Date(new Date(todayKey + 'T12:00:00Z').getTime() - 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const missingDays = useMissingShifts(fourteenDaysAgo);

  const role = ctx?.role;
  const isOwner = role === 'owner';
  const isManager = role === 'manager';
  const isMember = role === 'employee';

  return (
    <div className="pb-10">
      {/* First-login task: greets a freshly onboarded member until their
          first monthly goal exists. Sits above every command center. */}
      <FirstGoalTaskCard />

      {view?.kind === 'owner' && <OwnerDashboard view={view} />}
      {view?.kind === 'manager' && <ManagerDashboard view={view} />}
      {view?.kind === 'member' && <MemberDashboard view={view} />}

      <div className="mx-auto mt-8 w-full max-w-[1400px] space-y-8 px-4 sm:px-6 md:px-8">
        {!isOwner && missingDays.length > 0 && <MissingShiftBanner missingDays={missingDays} />}

        {/* Nudges render on the surface they concern (design §3.7): the ones
            aimed at Home land here, for everyone, and only when there are any. */}
        <HomeNudges />

        {/* OWNER — records only. The challenge lives in Office → Goals &
            challenges; decisions are the Attention items above. */}
        {isOwner && (
          <DeepLinked active={!!linkedRecordId}>
            <MyAccountabilityCard highlightId={linkedRecordId} />
          </DeepLinked>
        )}

        {/* MANAGER — the briefing above is the page. The one card left is the
            manager's own record, which renders only while one is open. */}
        {isManager && (
          <DeepLinked active={!!linkedRecordId}>
            <MyAccountabilityCard highlightId={linkedRecordId} />
          </DeepLinked>
        )}

        {/* TEAM MEMBER — own work only. No management surfaces. */}
        {isMember && (
          <Section label="My work" hint="Your focus, your records, your notes.">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <TodayFocusCard />
                <MessagesCloseoutCard />
                <MyMomentumCard />
              </div>
              <div className="space-y-4">
                <DeepLinked active={!!linkedSprintId}>
                  <SprintCard highlightId={linkedSprintId} />
                </DeepLinked>
                <DeepLinked active={!!linkedRecordId}>
                  <MyAccountabilityCard highlightId={linkedRecordId} />
                </DeepLinked>
                <UserNotesBoard />
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
