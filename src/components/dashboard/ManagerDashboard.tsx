import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { StatusLine, TodayException } from '@/lib/home-brief';
import type { ManagerView } from './types';
import {
  ActionLink, DashboardShell, EmptyState, HomeHeader, Lanes, Panel, StatusDot, ToolsPanel, ViewContext, focusRing, interactive, toneText,
  Arrow, actionClass,
} from './kit';
import { NeedsYouPanel } from './NeedsYou';
import { MyWorkPanel } from './MyWork';
import { SummaryPanel } from './Summary';
import { PerformanceSection } from './performance/PerformanceSection';
import { GoalMeters } from './performance/GoalMeters';
import { Noticing } from './performance/Noticing';
import { MissedTrend } from './performance/MissedTrend';
import { ChallengeCard } from './ChallengeCard';

/**
 * MANAGER — "what needs me, how is the office right now, and how is the
 * month going?"
 *
 * Home is still a briefing: it renders no form and takes no consequential
 * action — every row navigates, Review for a decision and Open otherwise.
 *
 *   1  header: greeting, office state, role context, the primary actions
 *   2  the short summary: the state and at most three priorities
 *   3  Needs you (grouped, actionable) beside Today and the status lines —
 *      routine status stays calm
 *   4  the performance block, then what is worth a look, then the trend
 *   5  the challenge when noteworthy, the manager's own items, coverage
 *   6  the tools area
 */

/** A person who is an exception today. Links to their item when one exists. */
function ExceptionRow({ person }: { person: TodayException }) {
  const inner = (
    <>
      <StatusDot tone={person.tone} />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{person.name}</span>
      <span className={cn('text-[13px] font-medium', toneText[person.tone])}>{person.status}</span>
      {person.action && (
        <span className={actionClass}>
          {person.action}
          <Arrow />
        </span>
      )}
    </>
  );
  const base = 'flex min-h-11 items-center gap-3 border-b border-border py-2.5 last:border-b-0';
  return person.href ? (
    <Link to={person.href} className={cn(base, 'group rounded-md hover:bg-muted/50', interactive, focusRing)}>{inner}</Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/** A status line: what it is, where it stands, and the one place to go. */
function StatusRow({ line }: { line: StatusLine }) {
  return (
    <Link to={line.href} className={cn('group flex min-h-11 items-center gap-3 border-b border-border py-3 last:border-b-0 hover:bg-muted/50', interactive, focusRing)}>
      <StatusDot tone={line.tone} />
      <span className="min-w-0 flex-1 text-[15px] leading-snug">
        <span className="font-medium">{line.label}</span>{' '}
        <span className={cn(line.tone === 'attention' ? 'text-[hsl(30_80%_32%)] dark:text-warning' : line.tone === 'urgent' ? 'text-destructive' : 'text-muted-foreground')}>
          {line.text}
        </span>
      </span>
      {line.action && (
        <span className={actionClass}>
          {line.action}
          <Arrow />
        </span>
      )}
    </Link>
  );
}

export default function ManagerDashboard({ view, chartWidth }: { view: ManagerView; chartWidth?: number }) {
  const { header, office, home, brief, mine, lanes, roleContext, toolGroups, performance, performanceState, goalMeters, insights, tools } = view;
  const { needs, today, wrapUp, spotlight, summary } = home;
  const nowCount = needs.now.length;
  const stillIn = today.exceptions.filter(e => e.status.startsWith('Still clocked in'));
  const closeoutStep = wrapUp && home.lastDay?.action ? home.lastDay : null;
  const statusLines: StatusLine[] = [];
  // The closeout step already leads Before you leave, and an unsealed day is
  // already a queue item; the status list carries the closeout only when
  // nothing else does (sealed, or nothing on record).
  if (home.lastDay && !closeoutStep && !home.lastDay.href.startsWith('/management?item=')) statusLines.push(home.lastDay);
  const closeAction = tools.find(t => t.id === 'close');

  const todayLine = today.asOf
    ? today.asOf === 'loading'
      ? 'Reading today’s roster…'
      : 'The roster could not be read. Nobody is marked in or out.'
    : today.exceptions.length === 0 && (today.phase === 'open' || today.phase === 'unknown_hours')
      ? `Everyone scheduled is in · ${today.countLine}`
      : today.countLine;

  const lead = wrapUp ? (
    <div className="mb-3">
      {stillIn.map(p => <ExceptionRow key={p.id} person={p} />)}
      {closeoutStep && <StatusRow line={closeoutStep} />}
      {home.inbox && <StatusRow line={home.inbox} />}
      {(stillIn.length > 0 || closeoutStep || home.inbox) && nowCount > 0 && (
        <p className="pt-3 text-[13px] font-semibold text-muted-foreground">Carries into tomorrow</p>
      )}
      {stillIn.length === 0 && !closeoutStep && !home.inbox && nowCount === 0 && (
        <EmptyState tone="good" title="Nothing needs attention tonight." detail="Everyone is clocked out and the closeout is sealed." compact />
      )}
    </div>
  ) : undefined;

  return (
    <DashboardShell>
      <HomeHeader
        greeting={header.personName}
        officeName={header.officeName}
        dateLabel={header.dateLabel}
        timeLabel={header.timeLabel}
        state={{ text: office.headline, tone: summary.tone }}
        context={<ViewContext context={roleContext} />}
        actions={
          <>
            {closeAction && <ActionLink to={closeAction.to} variant="secondary">{closeAction.label}</ActionLink>}
            <ActionLink to="/management" variant="primary">
              Attention{nowCount > 0 ? ` · ${nowCount}` : ''}
            </ActionLink>
          </>
        }
      />

      <div className="mt-5">
        <SummaryPanel summary={summary} title={wrapUp ? 'Wrap-up' : 'Right now'} />
      </div>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)] lg:items-start">
        <div className="space-y-4">
          <NeedsYouPanel
            needs={needs}
            title={wrapUp ? 'Before you leave' : 'Needs you'}
            emptyTitle={wrapUp ? 'Nothing carries into tomorrow.' : 'Nothing is waiting on you.'}
            emptyDetail="Decisions, fixes, and follow-ups are all clear."
            lead={lead}
          />
          {(mine.now.length > 0 || mine.waiting.length > 0) && (
            <MyWorkPanel work={mine} title="Mine" emptyTitle="Nothing is assigned to you personally." emptyDetail="" id="mine" />
          )}
        </div>

        <div className="space-y-4">
          {/* Today: exceptions, then one count line. Never a roster. */}
          <Panel
            title="Today"
            action={{ label: 'People', to: '/management/people' }}
            description={today.scheduled > 0 ? `${today.scheduled} scheduled` : undefined}
          >
            {!wrapUp && today.exceptions.map(p => <ExceptionRow key={p.id} person={p} />)}
            <p className={cn('py-2 text-[14px]', today.asOf === 'unavailable' ? 'text-[hsl(30_80%_32%)] dark:text-warning' : 'text-muted-foreground')}>{todayLine}</p>
          </Panel>

          {statusLines.length > 0 && (
            <Panel title="Status">
              {statusLines.map(line => <StatusRow key={line.id} line={line} />)}
            </Panel>
          )}

          {brief && brief.scope !== 'none' && (
            <Panel title={brief.dayLabel} action={{ label: 'Close the Day', to: '/deposit-log' }} description={brief.note ?? undefined}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {brief.facts.filter(f => f.id !== 'np-scheduled').map(f => (
                  <div key={f.id} className="min-w-0">
                    <dt className="text-[13px] font-semibold text-muted-foreground">{f.label}</dt>
                    <dd className={cn('mt-0.5 font-display text-[1.35rem] font-bold leading-none tabular-nums tracking-[-0.02em]', f.tone === 'attention' ? toneText.attention : f.tone === 'urgent' ? toneText.urgent : 'text-foreground')}>{f.value}</dd>
                    {f.detail && <dd className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{f.detail}</dd>}
                  </div>
                ))}
              </dl>
            </Panel>
          )}
        </div>
      </div>

      {/* 4 — the performance block: the same one the owner reads. */}
      <div className="mt-6">
        <PerformanceSection
          data={performance}
          state={performanceState}
          chartWidth={chartWidth}
          aside={
            <Panel title="Goals this month" action={{ label: 'Goals', to: '/goals' }} className="h-full">
              <GoalMeters meters={goalMeters} canSetGoals loading={performanceState === 'loading'} />
            </Panel>
          }
          supporting={(period, data) => (
            <div className="space-y-4">
              <Panel title="Worth a look" description="What only a comparison over the recorded days can show. Observed, not predicted.">
                <Noticing insights={insights} loading={performanceState === 'loading'} />
              </Panel>
              <Panel title="Cancellations and no-shows" action={{ label: 'Missed appointments', to: '/management/missed-appointments' }}>
                <MissedTrend period={period} data={data} width={chartWidth} />
              </Panel>
            </div>
          )}
        />
      </div>

      {spotlight && (
        <div className="mt-4">
          <Panel title={`Challenge · ${spotlight.reason}`} action={{ label: 'Goals', to: '/goals' }}>
            <ChallengeCard goal={spotlight.goal} reviewHref={`/management?item=challenge_verify:${spotlight.goal.id}`} />
          </Panel>
        </div>
      )}

      <div className="mt-4 space-y-4">
        <Lanes lanes={lanes} />
        <ToolsPanel groups={toolGroups} />
      </div>
    </DashboardShell>
  );
}
