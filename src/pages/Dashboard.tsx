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
import { LoadingLines, panelClass } from '@/components/dashboard/kit';
import { cn } from '@/lib/utils';

/**
 * Home — three role experiences, one product family.
 *
 * The top composition is the role command center (a view into existing
 * hooks). Below it sits deliberately EDITED working detail: each tier gets
 * only the interactive surfaces that tier actually works, under a named
 * section — never a generic "Detail" dump of every card, and never a second
 * copy of something the command center already answered.
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
    <section className="space-y-4" aria-label={label}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[16px] font-semibold leading-snug">{label}</h2>
        {hint && <p className="text-[13.5px] text-muted-foreground">{hint}</p>}
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
  const { view, isLoading } = useDashboardView();

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

      {!view && (
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 md:px-8">
          <div className={cn(panelClass, 'px-5 py-5')}>
            <LoadingLines lines={4} label={isLoading ? 'Reading your office…' : 'Your office could not be read. Refresh to try again.'} />
          </div>
        </div>
      )}
      {view?.kind === 'owner' && <OwnerDashboard view={view} />}
      {view?.kind === 'manager' && <ManagerDashboard view={view} />}
      {view?.kind === 'member' && <MemberDashboard view={view} />}

      <div className="mx-auto mt-6 w-full max-w-[1400px] space-y-6 px-4 sm:px-6 md:px-8">
        {!isOwner && missingDays.length > 0 && <MissingShiftBanner missingDays={missingDays} />}

        {/* Nudges render on the surface they concern (design §3.7): the ones
            aimed at Home land here, for everyone, and only when there are any. */}
        <HomeNudges />

        {/* OWNER and MANAGER — the one record that can be signed nowhere
            else: their own accountability record, only while one is open. */}
        {(isOwner || isManager) && (
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
