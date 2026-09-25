import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SentencePart, StatusLine, TodayException } from '@/lib/home-brief';
import type { ManagerView } from './types';
import {
  Band, CompactMasthead, DashboardShell, EmptyState, Lanes, MicroLabel, SignalRow, StatusDot, ViewContext, toneText,
} from './kit';
import { ItemRow, NeedsYouRows, actionClass, arrow } from './NeedsYou';
import { PerformanceSection } from './performance/PerformanceSection';
import { GoalMeters } from './performance/GoalMeters';
import { Noticing } from './performance/Noticing';
import { QuickTools } from './performance/QuickTools';
import { MissedTrend } from './performance/MissedTrend';
import { ChallengeCard } from './ChallengeCard';

/**
 * MANAGER — "How is the office performing and right now, and what needs me?"
 *
 * Home is still a briefing: it renders no form and takes no consequential
 * action — every row navigates, Review for a decision and Open otherwise.
 * What changed (design §3.3 amended): the financial picture is no longer a
 * pace clause behind a disclosure. It is the same strip, chart, goal meters
 * and observations Owner Home shows, in the same order, because a manager
 * who runs the day still needs to see the month.
 *
 *   1  compact masthead with the frequent tools
 *   2  one sentence of state, each fact linked
 *   3  the performance block (period row, strip, chart, goals, observations,
 *      the missed-appointment trend)
 *   4  Needs you (Before you leave after close) and Today
 *   5  the last closeout, the challenge when noteworthy, Mine, the lane
 */

/** The sentence: recorded facts, each one a link to where it can be acted on. */
function Sentence({ parts }: { parts: SentencePart[] }) {
  return (
    <p className="mt-2 max-w-[72ch] font-display text-[clamp(1.1rem,2.4vw,1.45rem)] font-bold leading-snug tracking-[-0.015em]">
      {parts.map((p, i) =>
        p.href ? (
          <Link
            key={i}
            to={p.href}
            className={cn(
              'underline decoration-border underline-offset-4 transition-colors hover:decoration-current',
              p.tone === 'attention' && 'text-warning',
              p.tone === 'urgent' && 'text-destructive',
            )}
          >
            {p.text}
          </Link>
        ) : (
          <span key={i} className={cn(p.tone === 'attention' && 'text-warning', p.tone === 'urgent' && 'text-destructive')}>
            {p.text}
          </span>
        ),
      )}
    </p>
  );
}

/** A person who is an exception today. Links to their item when one exists. */
function ExceptionRow({ person }: { person: TodayException }) {
  const inner = (
    <>
      <StatusDot tone={person.tone} />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{person.name}</span>
      <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.1em]', toneText[person.tone])}>{person.status}</span>
      {person.action && (
        <span className={actionClass}>
          {person.action}
          {arrow}
        </span>
      )}
    </>
  );
  const base = 'flex items-center gap-3 border-b border-border py-2.5';
  return person.href ? (
    <Link to={person.href} className={cn(base, 'group transition-colors hover:bg-muted/60')}>{inner}</Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** A status line: what it is, where it stands, and the one place to go. */
function StatusRow({ line }: { line: StatusLine }) {
  return (
    <Link to={line.href} className="group flex items-center gap-3 border-b border-border py-3 transition-colors hover:bg-muted/60">
      <StatusDot tone={line.tone} />
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
        <span className="font-medium">{line.label}</span>{' '}
        <span className={cn(line.tone === 'attention' ? 'text-warning' : line.tone === 'urgent' ? 'text-destructive' : 'text-muted-foreground')}>
          {line.text}
        </span>
      </span>
      {line.action && (
        <span className={actionClass}>
          {line.action}
          {arrow}
        </span>
      )}
    </Link>
  );
}

export default function ManagerDashboard({ view, chartWidth }: { view: ManagerView; chartWidth?: number }) {
  const { header, office, home, mine, lanes, roleContext, performance, performanceState, goalMeters, insights, tools } = view;
  const { needs, today, wrapUp, spotlight } = home;
  const nowCount = needs.top.length + needs.more;
  const stillIn = today.exceptions.filter(e => e.status.startsWith('Still clocked in'));
  const closeoutStep = wrapUp && home.lastDay?.action ? home.lastDay : null;
  const wrapEmpty = wrapUp && stillIn.length === 0 && !closeoutStep && !home.inbox && nowCount === 0;
  const statusLines: StatusLine[] = [];
  // The closeout step already leads Before you leave; the status band does not repeat it.
  if (home.lastDay && !closeoutStep) statusLines.push(home.lastDay);

  const todayLine = today.asOf
    ? today.asOf === 'loading'
      ? 'Reading today’s roster…'
      : 'The roster could not be read. Nobody is marked in or out.'
    : today.exceptions.length === 0 && (today.phase === 'open' || today.phase === 'unknown_hours')
      ? `Everyone scheduled is in · ${today.countLine}`
      : today.countLine;

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
            Attention{nowCount > 0 ? ` · ${nowCount}` : ''}
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      {/* 2 — the sentence. Every fact in it is recorded, and linked. */}
      <section className="mt-4 rounded-2xl border border-border bg-card px-5 py-4 sm:px-6">
        <MicroLabel className="text-primary">{wrapUp ? 'Wrap-up' : 'Right now'}</MicroLabel>
        <Sentence parts={home.sentence} />
      </section>

      {/* 3 — the performance block: the same one the owner reads. */}
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
        <div className="space-y-8">
          {/* 4 — Needs you, or Before you leave after close. Navigation only. */}
          <Band
            title={wrapUp ? 'Before you leave' : 'Needs you'}
            count={nowCount > 0 ? `${nowCount} now` : undefined}
            action={{ label: 'Attention', to: '/management' }}
          >
            {wrapUp && stillIn.map(p => <ExceptionRow key={p.id} person={p} />)}
            {closeoutStep && <StatusRow line={closeoutStep} />}
            {wrapUp && home.inbox && <StatusRow line={home.inbox} />}
            {wrapUp && needs.top.length > 0 && <MicroLabel className="pt-3">Carries into tomorrow</MicroLabel>}
            {wrapUp ? (
              <>
                {needs.top.map(item => <ItemRow key={item.key} item={item} />)}
                {needs.more > 0 && (
                  <Link to="/management" className="group flex items-center justify-between gap-3 border-b border-border py-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60">
                    <span>{needs.more} more need{needs.more === 1 ? 's' : ''} you now</span>
                    <span className={actionClass}>Open Attention{arrow}</span>
                  </Link>
                )}
                {wrapEmpty && <EmptyState tone="good" title="Nothing needs attention tonight." detail="Everyone is clocked out and the closeout is sealed." />}
              </>
            ) : (
              <NeedsYouRows needs={needs} emptyTitle="Nothing is waiting on you." emptyDetail="Decisions, fixes, and follow-ups are all clear." />
            )}
          </Band>

          {/* Today: exceptions, then one count line. Never a roster. */}
          <Band
            title="Today"
            count={today.scheduled > 0 ? `${today.scheduled} scheduled` : undefined}
            action={{ label: 'People', to: '/management/people' }}
          >
            {!wrapUp && today.exceptions.map(p => <ExceptionRow key={p.id} person={p} />)}
            <p className={cn('py-3 text-[13px]', today.asOf === 'unavailable' ? 'text-warning' : 'text-muted-foreground')}>{todayLine}</p>
          </Band>
        </div>

        <div className="space-y-8">
          {/* 5 — the last closeout line; pace lives in the meters above. */}
          {statusLines.length > 0 && (
            <Band title="Status">
              {statusLines.map(line => <StatusRow key={line.id} line={line} />)}
            </Band>
          )}

          {spotlight && (
            <Band title={`Challenge · ${spotlight.reason}`} action={{ label: 'Goals', to: '/goals' }}>
              <ChallengeCard goal={spotlight.goal} reviewHref={`/management?item=challenge_verify:${spotlight.goal.id}`} />
            </Band>
          )}

          {/* Mine: only what needs the manager personally. */}
          {mine.length > 0 && (
            <Band title="Mine" count={`${mine.length}`}>
              {mine.map(s => <SignalRow key={s.id} signal={s} />)}
            </Band>
          )}

          <Lanes lanes={lanes} />
        </div>
      </div>
    </DashboardShell>
  );
}
