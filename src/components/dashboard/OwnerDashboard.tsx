import type { OwnerView } from './types';
import {
  ActionLink, DashboardShell, EmptyState, HomeColumns, HomeHeader, Lanes, Panel, PersonRow, SignalRow, Slot, ToolsPanel, ViewContext,
} from './kit';
import { NeedsYouPanel } from './NeedsYou';
import { MyWorkPanel } from './MyWork';
import { SummaryPanel } from './Summary';
import { CloseoutPanel } from './CloseoutPanel';
import { PerformanceSection } from './performance/PerformanceSection';
import { GoalMeters } from './performance/GoalMeters';
import { Noticing } from './performance/Noticing';
import { MissedTrend } from './performance/MissedTrend';
import { ChallengeCard } from './ChallengeCard';

/**
 * OWNER — "what needs my decision, how is the office performing, what
 * changed, and where do I go next?"
 *
 *   1  header: greeting, office state, role context, the primary actions
 *   2  the short summary: the state and at most three priorities
 *   3  two columns that flow independently —
 *      main: Needs you (grouped, actionable), the owner's own items, then
 *      the performance block (period, strip, chart, the cancellation trend)
 *      directly beneath the queue, however tall the sidebar is;
 *      main, under the charts: what is worth a look;
 *      sidebar: staffing today, the latest closeout with its state, the
 *      month's goal meters, the office challenge
 *   4  coverage lanes, then the tools area
 *
 * Every number keeps one home: the closed-out day's facts in the closeout
 * panel, period totals in the strip, month progress in the meters. Missing
 * data is narrated, never rendered as $0. Under lg the columns dissolve
 * into one, actions first.
 */
export default function OwnerDashboard({ view, chartWidth }: { view: OwnerView; chartWidth?: number }) {
  const {
    header, office, summary, brief, lastDay, decisionCount, needs, mine, goal, staffing, exceptions, lanes, roleContext, toolGroups,
    performance, performanceState, goalMeters, insights, tools,
  } = view;
  const liveRoster = staffing.rows.length > 0;
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
      {/* Observations sit under the charts they read, with room to sit side by side. */}
      <Slot order={6}>
        <Panel title="Worth a look" description="What only a comparison over the recorded days can show. Observed, not predicted.">
          <Noticing insights={insights} loading={performanceState === 'loading'} />
        </Panel>
      </Slot>
    </>
  );

  const aside = (
    <>
      {(liveRoster || exceptions.length > 0) && (
        <Slot order={3}>
          <Panel
            title="Staffing today"
            count={liveRoster ? staffing.rows.length : undefined}
            countTone="calm"
            action={{ label: 'Attendance', to: '/management/attendance' }}
          >
            {exceptions.map(s => <SignalRow key={s.id} signal={s} />)}
            {liveRoster && staffing.rows.map(p => <PersonRow key={p.id} person={p} />)}
          </Panel>
        </Slot>
      )}
      <Slot order={4}>
        <CloseoutPanel brief={brief} lastDay={lastDay} />
      </Slot>
      <Slot order={7}>
        <Panel title="Goals this month" action={{ label: 'Goals', to: '/goals' }}>
          <GoalMeters meters={goalMeters} canSetGoals loading={performanceState === 'loading'} />
        </Panel>
      </Slot>
      <Slot order={8}>
        <Panel title="Office challenge" action={{ label: 'Goals', to: '/goals' }}>
          {goal ? (
            <ChallengeCard goal={goal} compact />
          ) : (
            <EmptyState
              tone="setup"
              title="No office goal is running."
              detail="Pick one shared number the office can rally around — the Sprint Builder can scope it."
              action={{ label: 'Choose a goal', to: '/goals' }}
              compact
            />
          )}
        </Panel>
      </Slot>
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
        <SummaryPanel summary={summary} title="Right now" />
      </div>

      <HomeColumns className="mt-4" main={main} aside={aside} />

      <div className="mt-4 space-y-4">
        <Lanes lanes={lanes} />
        <ToolsPanel groups={toolGroups} />
      </div>
    </DashboardShell>
  );
}
