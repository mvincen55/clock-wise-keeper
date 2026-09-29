import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { TodayException } from '@/lib/home-brief';
import type { ManagerView } from './types';
import {
  ActionLink, DashboardShell, EmptyState, HomeColumns, HomeHeader, Lanes, Panel, Slot, StatusDot, ToolsPanel, ViewContext, focusRing, interactive, toneText,
  Arrow, actionClass,
} from './kit';
import { NeedsYouPanel } from './NeedsYou';
import { MyWorkPanel } from './MyWork';
import { SummaryPanel } from './Summary';
import { CloseoutPanel, StatusRow } from './CloseoutPanel';
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
 *   3  two columns that flow independently —
 *      main: Needs you (grouped, actionable), the manager's own items, then
 *      the performance block (period, strip, chart, the cancellation trend)
 *      directly beneath the queue, however tall the sidebar is;
 *      sidebar: Today, the latest closeout with its state, the month's goal
 *      meters, what is worth a look, the challenge when noteworthy
 *   4  coverage lanes, then the tools area
 *
 * Under lg the columns dissolve into one, actions first: Needs you, Mine,
 * Today, the closeout, then the numbers.
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

export default function ManagerDashboard({ view, chartWidth }: { view: ManagerView; chartWidth?: number }) {
  const { header, office, home, brief, mine, lanes, roleContext, toolGroups, performance, performanceState, goalMeters, insights, tools } = view;
  const { needs, today, wrapUp, spotlight, summary } = home;
  const nowCount = needs.now.length;
  const stillIn = today.exceptions.filter(e => e.status.startsWith('Still clocked in'));
  const closeoutStep = wrapUp && home.lastDay?.action ? home.lastDay : null;
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

  const main = (
    <>
      <Slot order={1}>
        <NeedsYouPanel
          needs={needs}
          title={wrapUp ? 'Before you leave' : 'Needs you'}
          emptyTitle={wrapUp ? 'Nothing carries into tomorrow.' : 'Nothing is waiting on you.'}
          emptyDetail="Decisions, fixes, and follow-ups are all clear."
          lead={lead}
        />
      </Slot>
      {(mine.now.length > 0 || mine.waiting.length > 0) && (
        <Slot order={2}>
          <MyWorkPanel work={mine} title="Mine" emptyTitle="Nothing is assigned to you personally." emptyDetail="" id="mine" />
        </Slot>
      )}
      {/* The performance block: the same one the owner reads, directly under the queue. */}
      <Slot order={5}>
        <PerformanceSection
          data={performance}
          state={performanceState}
          chartWidth={chartWidth}
          supporting={(period, data) => (
            <Panel title="Cancellations and no-shows" action={{ label: 'Missed appointments', to: '/management/missed-appointments' }}>
              <MissedTrend period={period} data={data} width={chartWidth} />
            </Panel>
          )}
        />
      </Slot>
    </>
  );

  const aside = (
    <>
      {/* Today: exceptions, then one count line. Never a roster. */}
      <Slot order={3}>
        <Panel
          title="Today"
          action={{ label: 'People', to: '/management/people' }}
          description={today.scheduled > 0 ? `${today.scheduled} scheduled` : undefined}
        >
          {!wrapUp && today.exceptions.map(p => <ExceptionRow key={p.id} person={p} />)}
          <p className={cn('py-2 text-[14px]', today.asOf === 'unavailable' ? 'text-[hsl(30_80%_32%)] dark:text-warning' : 'text-muted-foreground')}>{todayLine}</p>
        </Panel>
      </Slot>
      <Slot order={4}>
        <CloseoutPanel brief={brief} lastDay={home.lastDay} />
      </Slot>
      <Slot order={6}>
        <Panel title="Goals this month" action={{ label: 'Goals', to: '/goals' }}>
          <GoalMeters meters={goalMeters} canSetGoals loading={performanceState === 'loading'} />
        </Panel>
      </Slot>
      <Slot order={7}>
        <Panel title="Worth a look" description="What only a comparison over the recorded days can show. Observed, not predicted.">
          <Noticing insights={insights} loading={performanceState === 'loading'} />
        </Panel>
      </Slot>
      {spotlight && (
        <Slot order={8}>
          <Panel title={`Challenge · ${spotlight.reason}`} action={{ label: 'Goals', to: '/goals' }}>
            <ChallengeCard goal={spotlight.goal} reviewHref={`/management?item=challenge_verify:${spotlight.goal.id}`} />
          </Panel>
        </Slot>
      )}
    </>
  );

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

      <HomeColumns className="mt-4" main={main} aside={aside} />

      <div className="mt-4 space-y-4">
        <Lanes lanes={lanes} />
        <ToolsPanel groups={toolGroups} />
      </div>
    </DashboardShell>
  );
}
