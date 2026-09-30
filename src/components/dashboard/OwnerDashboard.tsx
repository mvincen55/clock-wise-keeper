import { useState } from 'react';
import type { Period } from '@/lib/performance-series';
import type { OwnerView } from './types';
import {
  ActionLink, DashboardShell, HomeColumns, HomeHeader, Lanes, Panel, Slot, ToolsPanel, ViewContext,
} from './kit';
import { NeedsYouPanel } from './NeedsYou';
import { MyWorkPanel } from './MyWork';
import { SummaryPanel } from './Summary';
import { CloseoutPanel } from './CloseoutPanel';
import { TodayPanel } from './TodayPanel';
import { PerformanceSection } from './performance/PerformanceSection';
import { Noticing } from './performance/Noticing';
import { MissedTrend, missedHref } from './performance/MissedTrend';

/**
 * OWNER — "what needs my decision, how is the office performing, what
 * changed, and where do I go next?"
 *
 *   1  header: greeting, office state, role context, the primary actions
 *   2  the board: the state, everyone on the roster (their schedule a hover
 *      away, their record a click away), at most three priorities, and the
 *      month — the goal meters and the challenge — above the fold
 *   3  two columns that flow independently —
 *      main: Needs you (grouped, actionable), the owner's own items, then
 *      the performance block (period, strip, chart) directly beneath the
 *      queue, however tall the sidebar is;
 *      sidebar, kept in view while the main column scrolls: Today
 *      (attendance facts to review, exceptions, one count line), the latest
 *      closeout with its state, the cancellation trend scoped to the same
 *      period row
 *   4  what is worth a look, at full width under both columns
 *   5  coverage lanes, then the tools area
 *
 * Every number keeps one home: the closed-out day's facts in the closeout
 * panel, period totals in the strip, month progress in the board's meters.
 * Missing data is narrated, never rendered as $0. Under lg the columns
 * dissolve into one, actions first.
 */
export default function OwnerDashboard({ view, chartWidth }: { view: OwnerView; chartWidth?: number }) {
  const {
    header, office, summary, today, brief, lastDay, decisionCount, needs, mine, goal, exceptions, lanes, roleContext, toolGroups,
    performance, performanceState, goalMeters, insights, tools,
  } = view;
  const [period, setPeriod] = useState<Period | null>(null);
  const closeAction = tools.find(t => t.id === 'close');

  const main = (
    <>
      <Slot order={1}>
        <NeedsYouPanel needs={needs} emptyTitle="No owner decisions are waiting." emptyDetail="Approvals, reviews, and sign-offs are clear." />
      </Slot>
      {(mine.now.length > 0 || mine.waiting.length > 0) && (
        <Slot order={2}>
          <MyWorkPanel work={mine} title="Mine" emptyTitle="Nothing is assigned to you personally." emptyDetail="" id="mine" />
        </Slot>
      )}
      <Slot order={5}>
        <PerformanceSection data={performance} state={performanceState} chartWidth={chartWidth} onPeriodChange={setPeriod} />
      </Slot>
    </>
  );

  const aside = (
    <>
      <Slot order={3}>
        <TodayPanel today={today} wrapUp={today.phase === 'after_close'} signals={exceptions} />
      </Slot>
      <Slot order={4}>
        <CloseoutPanel brief={brief} lastDay={lastDay} />
      </Slot>
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
              Attention{decisionCount > 0 ? ` · ${decisionCount}` : ''}
            </ActionLink>
          </>
        }
      />

      <div className="mt-5">
        <SummaryPanel
          summary={summary}
          title="Right now"
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
        <Panel title="Worth a look" description="What only a comparison over the recorded days can show. Observed, not predicted.">
          <Noticing insights={insights} loading={performanceState === 'loading'} />
        </Panel>
        <Lanes lanes={lanes} />
        <ToolsPanel groups={toolGroups} />
      </div>
    </DashboardShell>
  );
}
