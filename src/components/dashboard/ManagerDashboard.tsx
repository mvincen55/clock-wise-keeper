import { useState } from 'react';
import type { Period } from '@/lib/performance-series';
import type { ManagerView } from './types';
import {
  ActionLink, DashboardShell, EmptyState, HomeColumns, HomeHeader, Lanes, Panel, Slot, ToolsPanel, ViewContext,
} from './kit';
import { NeedsYouPanel } from './NeedsYou';
import { MyWorkPanel } from './MyWork';
import { SummaryPanel } from './Summary';
import { CloseoutPanel, StatusRow } from './CloseoutPanel';
import { ExceptionRow, TodayPanel } from './TodayPanel';
import { PerformanceSection } from './performance/PerformanceSection';
import { Noticing } from './performance/Noticing';
import { MissedTrend, missedHref } from './performance/MissedTrend';

/**
 * MANAGER — "what needs me, how is the office right now, and how is the
 * month going?"
 *
 * Home is still a briefing: it renders no form and takes no consequential
 * action — every row navigates, Review for a decision and Open otherwise.
 *
 *   1  header: greeting, office state, role context, the primary actions
 *   2  the board: the state, everyone on the roster (their schedule a hover
 *      away, their record a click away), at most three priorities, and the
 *      month — the goal meters and the challenge — above the fold
 *   3  two columns that flow independently —
 *      main: Needs you (grouped, actionable), the manager's own items, then
 *      the performance block (period, strip, chart) directly beneath the
 *      queue, however tall the sidebar is;
 *      sidebar, kept in view while the main column scrolls: Today
 *      (exceptions and one count line), the latest closeout with its
 *      state, the cancellation trend scoped to the same period row
 *   4  what is worth a look, at full width under both columns
 *   5  coverage lanes, then the tools area
 *
 * Under lg the columns dissolve into one, actions first: Needs you, Mine,
 * Today, the closeout, then the numbers.
 */
export default function ManagerDashboard({ view, chartWidth }: { view: ManagerView; chartWidth?: number }) {
  const { header, office, home, brief, mine, goal, lanes, roleContext, toolGroups, performance, performanceState, goalMeters, insights, tools } = view;
  const { needs, today, wrapUp, summary } = home;
  const [period, setPeriod] = useState<Period | null>(null);
  const nowCount = needs.now.length;
  const stillIn = today.exceptions.filter(e => e.status.startsWith('Still clocked in'));
  const closeoutStep = wrapUp && home.lastDay?.action ? home.lastDay : null;
  const closeAction = tools.find(t => t.id === 'close');

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
        <PerformanceSection data={performance} state={performanceState} chartWidth={chartWidth} onPeriodChange={setPeriod} />
      </Slot>
    </>
  );

  const aside = (
    <>
      <Slot order={3}>
        <TodayPanel today={today} wrapUp={wrapUp} />
      </Slot>
      <Slot order={4}>
        <CloseoutPanel brief={brief} lastDay={home.lastDay} />
      </Slot>
      {/* The cancellation trend follows the period row in the main column. */}
      {performance && period && (
        <Slot order={6}>
          <Panel title="Cancellations and no-shows" description={period.rangeLabel} action={{ label: 'Missed appointments', to: missedHref(period) }}>
            <MissedTrend period={period} data={performance} width={chartWidth} />
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
        <SummaryPanel
          summary={summary}
          title={wrapUp ? 'Wrap-up' : 'Right now'}
          month={{
            meters: goalMeters,
            loading: performanceState === 'loading',
            canSetGoals: true,
            challenge: goal,
            reviewHref: goal ? `/management?item=challenge_verify:${goal.id}` : undefined,
          }}
        />
      </div>

      <HomeColumns className="mt-4" main={main} aside={aside} stickyAside />

      <div className="mt-4 space-y-4">
        {/* Observations read the whole month; at full width they sit side by side. */}
        <Panel title="Worth a look" description="What only a comparison over the recorded days can show. Observed, not predicted.">
          <Noticing insights={insights} loading={performanceState === 'loading'} />
        </Panel>
        <Lanes lanes={lanes} />
        <ToolsPanel groups={toolGroups} />
      </div>
    </DashboardShell>
  );
}
