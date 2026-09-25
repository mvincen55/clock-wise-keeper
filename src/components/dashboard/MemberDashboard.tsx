import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { MemberView } from './types';
import {
  Band, CompactMasthead, DashboardShell, EmptyState, FigureStrip, Lanes, MicroLabel, SignalRow, StatusDot, ViewContext,
} from './kit';
import { PerformanceSection } from './performance/PerformanceSection';
import { GoalMeters } from './performance/GoalMeters';
import { ChallengeCard } from './ChallengeCard';

/**
 * TEAM MEMBER — "what should I do next, and how is our office doing?"
 *
 *   A  My next move — the one highest-priority assigned item (or "clear")
 *   B  Our office pulse — the same rows, the same chart, the same goal
 *      meters the owner reads, limited to the metrics the office shares.
 *      Office-level only: no rankings, no personal attribution, no peer
 *      comparisons, no management detail.
 *   C  role-relevant pulse + the operational-role lanes
 *   D  my open work
 *   E  the shared office challenge
 *   F  personal utilities — recorded time, PTO, timesheet links. Useful, but
 *      deliberately at the bottom: Purple Envelope is not a time clock.
 *
 * Clocking stays in the shell's compact GlobalTimeControl / sticky mobile
 * bar. Time analytics live on the Timesheet page, not here.
 */
export default function MemberDashboard({ view, chartWidth }: { view: MemberView; chartWidth?: number }) {
  const {
    header, next, officePulseNote, rolePulse, mine, goal, status, utilities, lanes, roleContext,
    performance, performanceState, goalMeters,
  } = view;
  const sharesAnything = !!performance && (performance.visibility.production || performance.visibility.collections || performance.visibility.newPatients);
  const hasRecorded = !!performance && performance.sources.closeouts.length > 0;
  const showPulse = performanceState !== 'error' && sharesAnything && (hasRecorded || performanceState === 'loading');

  return (
    <DashboardShell>
      <CompactMasthead
        officeName={header.officeName}
        roleLabel={header.roleLabel}
        title={header.personName}
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
        context={<ViewContext context={roleContext} />}
      />

      {/* A — MY NEXT MOVE. One action, or a genuine all-clear. */}
      <section className="mt-4 overflow-hidden rounded-2xl bg-primary px-5 py-5 text-primary-foreground sm:px-6">
        <MicroLabel className="text-primary-foreground/70">My next move</MicroLabel>
        {next ? (
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="font-display text-[clamp(1.25rem,3vw,1.7rem)] font-extrabold leading-[1] tracking-[-0.02em]">{next.title}</p>
              <p className="mt-1.5 max-w-[52ch] text-[13px] leading-snug text-primary-foreground/75">{next.detail}</p>
            </div>
            <Link
              to={next.href}
              className="group inline-flex min-h-9 items-center gap-2 rounded-full border border-primary-foreground/70 px-4 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors hover:bg-primary-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
              {next.cta}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ) : (
          <p className="mt-2 max-w-[48ch] font-display text-[clamp(1.1rem,2.6vw,1.45rem)] font-bold leading-snug tracking-[-0.02em]">
            You&rsquo;re clear. Nothing is assigned to you right now.
          </p>
        )}
      </section>

      {/* B — OUR OFFICE PULSE. Real values when the office shares them; a
          hidden metric is simply absent — no locked teaser. */}
      {showPulse && (
        <div className="mt-6">
          <Band title="Our office pulse" action={{ label: 'Close the Day', to: '/deposit-log' }}>
            <div className="pt-3">
              <PerformanceSection
                data={performance}
                state={performanceState}
                compact
                chartWidth={chartWidth}
                aside={
                  goalMeters && goalMeters.length > 0 ? (
                    <Band title="Goals this month" action={{ label: 'Goals', to: '/goals' }}>
                      <GoalMeters meters={goalMeters} canSetGoals={false} loading={performanceState === 'loading'} />
                    </Band>
                  ) : undefined
                }
              />
            </div>
            {officePulseNote && <p className="mt-3 text-[11.5px] text-muted-foreground">{officePulseNote}</p>}
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              Office totals only — this is a shared scoreboard, never an individual one.
            </p>
          </Band>
        </div>
      )}

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1.3fr_1fr] lg:gap-10">
        {/* Left: my role's slice of the office, and my lanes. */}
        <div className="space-y-8">
          {rolePulse.length > 0 && (
            <Band title="For my role">
              {rolePulse.map(item => <SignalRow key={item.id} signal={item} />)}
            </Band>
          )}
          <Lanes lanes={lanes} />
        </div>

        {/* Right: my open work, the shared goal, my utilities. */}
        <div className="space-y-8">
          <Band title="My open work" count={`${mine.length}`} action={{ label: 'Workplace', to: '/workplace' }}>
            {mine.length === 0 ? (
              <EmptyState tone="good" title="You're clear." detail="Nothing is assigned to you. Anything new will land here and in your inbox." />
            ) : (
              mine.map(s => <SignalRow key={s.id} signal={s} />)
            )}
          </Band>

          <Band title="Office goal" action={{ label: 'Goals', to: '/goals' }}>
            {goal ? (
              <ChallengeCard goal={goal} compact />
            ) : (
              <EmptyState tone="neutral" title="No office goal is running." detail="When the office starts a sprint, its shared progress lives here." />
            )}
          </Band>

          <Band title="My time & PTO" action={{ label: 'Timesheet', to: '/timesheet' }}>
            <div className="flex items-center gap-2.5 border-b border-border py-3">
              <StatusDot tone={status.tone} />
              <p className="text-[13.5px] font-medium">{status.label}</p>
              <p className="min-w-0 flex-1 truncate text-right text-[12px] text-muted-foreground">{status.detail}</p>
            </div>
            <FigureStrip figures={utilities} />
          </Band>
        </div>
      </div>
    </DashboardShell>
  );
}
