import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OwnerView } from './types';
import {
  Band, CompactMasthead, DashboardShell, EmptyState, Lanes, MicroLabel, PersonRow, SignalRow, StatusDot, ViewContext,
} from './kit';
import { NeedsYouRows } from './NeedsYou';
import { PerformanceSection } from './performance/PerformanceSection';
import { GoalMeters } from './performance/GoalMeters';
import { Noticing } from './performance/Noticing';
import { QuickTools } from './performance/QuickTools';
import { MissedTrend } from './performance/MissedTrend';
import { ChallengeCard } from './ChallengeCard';

/**
 * OWNER — "how is my office performing, what changed, and what needs me?"
 *
 *   1  compact masthead: office, date, role context, the frequent tools
 *   2  the day's briefing sentence with the closed-out day's facts inline
 *   3  the performance block: one period row, the strip, the chart beside
 *      the month's goal meters and the observations, the missed-appointment
 *      trend underneath
 *   4  Needs you (the first three Attention items) and the office challenge
 *   5  staffing only as a live question or a real exception; the owner's lane
 *
 * Every number keeps one home: the day's facts in the sentence line, period
 * totals in the strip, month progress in the meters. Missing data is
 * narrated, never rendered as $0.
 */
export default function OwnerDashboard({ view, chartWidth }: { view: OwnerView; chartWidth?: number }) {
  const {
    header, office, summary, brief, decisionCount, needs, goal, staffing, exceptions, lanes, roleContext,
    performance, performanceState, goalMeters, insights, tools,
  } = view;
  const liveRoster = staffing.rows.length > 0;
  const nowCount = needs.top.length + needs.more;

  return (
    <DashboardShell>
      <CompactMasthead
        officeName={header.officeName}
        roleLabel={header.roleLabel}
        title={header.personName}
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
        context={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <StatusDot tone={office.phase === 'open' ? 'steady' : 'calm'} />
              {office.headline}
            </span>
            <ViewContext context={roleContext} />
          </div>
        }
        tools={<QuickTools tools={tools} />}
        right={
          <Link
            to="/management"
            className="group inline-flex min-h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Management{decisionCount > 0 ? ` · ${decisionCount}` : ''}
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      {/* 2 — the day's briefing: one sentence from recorded facts. */}
      <section className="mt-4 rounded-2xl border border-border bg-card px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <MicroLabel className="text-primary">Today&rsquo;s office pulse</MicroLabel>
          {brief && brief.scope !== 'none' && <MicroLabel>{brief.dayLabel}</MicroLabel>}
        </div>
        {summary ? (
          <p className="mt-2 max-w-[72ch] font-display text-[clamp(1.1rem,2.4vw,1.45rem)] font-bold leading-snug tracking-[-0.015em]">
            {summary}
          </p>
        ) : (
          <p className="mt-2 text-[14px] text-muted-foreground">Reading the day&rsquo;s numbers…</p>
        )}
        {brief?.note && <p className="mt-1.5 text-[12.5px] text-muted-foreground">{brief.note}</p>}
        {brief && brief.scope !== 'none' && brief.facts.length > 0 && (
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border pt-3">
            {brief.facts.map(f => (
              <div key={f.id} className="flex items-baseline gap-1.5 text-[12.5px]">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className={cn('font-semibold tabular-nums', f.tone === 'attention' && 'text-warning', f.tone === 'urgent' && 'text-destructive')}>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {brief && brief.scope === 'none' && (
          <EmptyState
            tone="setup"
            title="No days have been closed out yet."
            detail="The pulse reads production, collections, and missed appointments straight off the deposit log."
            action={{ label: 'Open the deposit log', to: '/deposit-log' }}
          />
        )}
      </section>

      {/* 3 — the performance block. */}
      <div className="mt-6">
        <PerformanceSection
          data={performance}
          state={performanceState}
          chartWidth={chartWidth}
          aside={
            <div className="space-y-6">
              <Band title="Goals this month" action={{ label: 'Goals', to: '/goals' }}>
                <GoalMeters meters={goalMeters} canSetGoals loading={performanceState === 'loading'} />
              </Band>
              <Band title="What I’m noticing">
                <Noticing insights={insights} loading={performanceState === 'loading'} />
              </Band>
            </div>
          }
          supporting={(period, data) => (
            <Band title="Cancellations and no-shows" action={{ label: 'Missed appointments', to: '/management/missed-appointments' }}>
              <div className="pt-3">
                <MissedTrend period={period} data={data} width={chartWidth} />
              </div>
            </Band>
          )}
        />
      </div>

      <div className="mt-8 grid gap-8 [&>*]:min-w-0 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
        {/* 4 — Needs you, and the office challenge once. */}
        <div className="space-y-8">
          <Band title="Needs you" count={nowCount > 0 ? `${decisionCount} now` : undefined} action={{ label: 'Attention', to: '/management' }}>
            <NeedsYouRows needs={needs} emptyTitle="No owner decisions are waiting." emptyDetail="Approvals, reviews, and sign-offs are clear." />
          </Band>

          <Band title="Office challenge" action={{ label: 'Goals', to: '/goals' }}>
            {goal ? (
              <ChallengeCard goal={goal} />
            ) : (
              <EmptyState
                tone="setup"
                title="No office goal is running."
                detail="Pick one shared number the office can rally around — the Sprint Builder can scope it."
                action={{ label: 'Choose a goal', to: '/goals' }}
              />
            )}
          </Band>
        </div>

        {/* 5 — staffing only when it is a live question or a real exception. */}
        <div className="space-y-8">
          {(liveRoster || exceptions.length > 0) && (
            <Band
              title="Staffing today"
              count={liveRoster ? `${staffing.rows.length}` : undefined}
              action={{ label: 'Attendance', to: '/management/attendance' }}
            >
              {exceptions.map(s => <SignalRow key={s.id} signal={s} />)}
              {liveRoster && staffing.rows.map(p => <PersonRow key={p.id} person={p} />)}
            </Band>
          )}
          <Lanes lanes={lanes} />
        </div>
      </div>
    </DashboardShell>
  );
}
