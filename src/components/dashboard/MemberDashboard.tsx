import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MemberView } from './types';
import {
  ActionLink, DashboardShell, EmptyState, FigureStrip, HomeHeader, Lanes, Panel, SignalRow, StatusDot, ToolsPanel, ViewContext, focusRing, interactive,
} from './kit';
import { MyWorkPanel } from './MyWork';
import { PerformanceSection } from './performance/PerformanceSection';
import { GoalMeters } from './performance/GoalMeters';
import { ChallengeCard } from './ChallengeCard';

/**
 * TEAM MEMBER — "what needs me, how is my work going, and how is our office
 * doing?"
 *
 *   1  header: greeting, clock status, role context
 *   2  My next move — the one highest-priority item, or a genuine all-clear
 *   3  Needs you (my own items, exact records) beside my role's slice of the
 *      office, the shared challenge, and my time & PTO
 *   4  Our office pulse — the same rows, chart, and goal meters the owner
 *      reads, limited to the metrics the office shares; office-level only
 *   5  coverage today, then the tools area
 *
 * Clocking stays in the shell's GlobalTimeControl / sticky mobile bar.
 */
export default function MemberDashboard({ view, chartWidth }: { view: MemberView; chartWidth?: number }) {
  const {
    header, work, officePulseNote, rolePulse, goal, status, utilities, lanes, roleContext, toolGroups, attendanceStanding,
    performance, performanceState, goalMeters,
  } = view;
  const sharesAnything = !!performance && (performance.visibility.production || performance.visibility.collections || performance.visibility.newPatients);
  const hasRecorded = !!performance && performance.sources.closeouts.length > 0;
  const showPulse = performanceState !== 'error' && sharesAnything && (hasRecorded || performanceState === 'loading');
  const next = work.next;

  return (
    <DashboardShell>
      <HomeHeader
        greeting={header.personName}
        officeName={header.officeName}
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
        state={{ text: status.label, tone: status.tone }}
        context={<ViewContext context={roleContext} />}
        actions={<ActionLink to="/timesheet" variant="secondary">Timesheet</ActionLink>}
      />

      {/* 2 — MY NEXT MOVE. One action, or a genuine all-clear. */}
      <section aria-label="My next move" className="mt-5 overflow-hidden rounded-xl bg-primary px-5 py-5 text-primary-foreground sm:px-6">
        <p className="text-[13px] font-semibold text-primary-foreground/75">My next move</p>
        {next ? (
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <p className="text-[clamp(1.25rem,2.6vw,1.6rem)] font-bold leading-tight tracking-[-0.01em]">{next.title}</p>
              <p className="mt-1.5 max-w-[60ch] text-[14px] leading-snug text-primary-foreground/80">{next.detail}</p>
            </div>
            <Link
              to={next.href}
              className={cn('group inline-flex min-h-11 items-center gap-2 rounded-full bg-primary-foreground px-5 text-[14.5px] font-semibold text-primary hover:bg-primary-foreground/90', interactive, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary')}
            >
              {next.action}
              <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="mt-1.5 max-w-[50ch] text-[clamp(1.15rem,2.4vw,1.4rem)] font-bold leading-snug tracking-[-0.01em]">
            You’re clear. Nothing is assigned to you right now.
          </p>
        )}
      </section>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,1fr)] lg:items-start">
        <MyWorkPanel
          work={work}
          emptyTitle="You’re clear."
          emptyDetail="Nothing is assigned to you. Anything new will land here and in your inbox."
          description="Each row opens the exact record. Nothing here is a task for anyone else."
        />

        <div className="space-y-4">
          {rolePulse.length > 0 && (
            <Panel title="For my role" description="Office-level facts your role acts on. Never an individual score.">
              {rolePulse.map(item => <SignalRow key={item.id} signal={item} />)}
            </Panel>
          )}

          <Panel title="Office goal" action={{ label: 'Goals', to: '/goals' }}>
            {goal ? (
              <ChallengeCard goal={goal} compact />
            ) : (
              <EmptyState tone="neutral" title="No office goal is running." detail="When the office starts a sprint, its shared progress lives here." compact />
            )}
          </Panel>

          <Panel title="My time & PTO" action={{ label: 'Timesheet', to: '/timesheet' }}>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-3">
              <StatusDot tone={status.tone} />
              <p className="text-[15px] font-medium">{status.label}</p>
              <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{status.detail}</p>
            </div>
            <FigureStrip figures={utilities} />
            {attendanceStanding && (
              <Link to={attendanceStanding.href} className={cn('mt-3 flex items-center gap-2 rounded-md text-[13.5px] text-muted-foreground hover:text-foreground', interactive, focusRing)}>
                <StatusDot tone={attendanceStanding.tone} />
                {attendanceStanding.text}
              </Link>
            )}
          </Panel>
        </div>
      </div>

      {/* 4 — OUR OFFICE PULSE. Real values when the office shares them; a
          hidden metric is simply absent — no locked teaser. */}
      {showPulse && (
        <section className="mt-6" aria-labelledby="office-pulse-title">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
            <h2 id="office-pulse-title" className="text-[16px] font-semibold">Our office pulse</h2>
            <ActionLink to="/deposit-log" variant="text" size="sm">Close the Day</ActionLink>
          </div>
          <PerformanceSection
            data={performance}
            state={performanceState}
            compact
            chartWidth={chartWidth}
            aside={
              goalMeters && goalMeters.length > 0 ? (
                <Panel title="Goals this month" action={{ label: 'Goals', to: '/goals' }} className="h-full">
                  <GoalMeters meters={goalMeters} canSetGoals={false} loading={performanceState === 'loading'} />
                </Panel>
              ) : undefined
            }
          />
          <p className="mt-3 text-[13px] text-muted-foreground">
            {officePulseNote ? `${officePulseNote} ` : ''}Office totals only — this is a shared scoreboard, never an individual one.
          </p>
        </section>
      )}

      <div className="mt-4 space-y-4">
        <Lanes lanes={lanes} />
        <ToolsPanel groups={toolGroups} />
      </div>
    </DashboardShell>
  );
}
