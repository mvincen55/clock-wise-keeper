import { cn } from '@/lib/utils';
import type { OwnerView } from './types';
import {
  ActionLink, DashboardShell, EmptyState, HomeHeader, Lanes, Panel, PersonRow, SignalRow, ToolsPanel, ViewContext, toneText,
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
 * OWNER — "what needs my decision, how is the office performing, what
 * changed, and where do I go next?"
 *
 *   1  header: greeting, office state, role context, the primary actions
 *   2  the short summary: the state and at most three priorities
 *   3  Needs you (grouped, actionable) beside the latest closeout and
 *      staffing — status, not tasks
 *   4  the performance block: one period row, the strip, the chart beside
 *      the month's goal meters, then what is worth a look
 *   5  the missed-appointment trend, the office challenge, the owner's own
 *      items when there are any
 *   6  the tools area
 *
 * Every number keeps one home: the closed-out day's facts in the status
 * panel, period totals in the strip, month progress in the meters. Missing
 * data is narrated, never rendered as $0.
 */
export default function OwnerDashboard({ view, chartWidth }: { view: OwnerView; chartWidth?: number }) {
  const {
    header, office, summary, brief, decisionCount, needs, mine, goal, staffing, exceptions, lanes, roleContext, toolGroups,
    performance, performanceState, goalMeters, insights, tools,
  } = view;
  const liveRoster = staffing.rows.length > 0;
  const closeAction = tools.find(t => t.id === 'close');

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

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)] lg:items-start">
        <div className="space-y-4">
          <NeedsYouPanel needs={needs} emptyTitle="No owner decisions are waiting." emptyDetail="Approvals, reviews, and sign-offs are clear." />
          {(mine.now.length > 0 || mine.waiting.length > 0) && (
            <MyWorkPanel work={mine} title="Mine" emptyTitle="Nothing is assigned to you personally." emptyDetail="" id="mine" />
          )}
        </div>

        <div className="space-y-4">
          <Panel
            title={brief && brief.scope !== 'none' ? brief.dayLabel : 'Latest closeout'}
            action={{ label: 'Close the Day', to: '/deposit-log' }}
            description={brief?.note ?? undefined}
          >
            {!brief ? (
              <p className="py-2 text-[14px] text-muted-foreground" aria-busy="true">Reading the day’s numbers…</p>
            ) : brief.scope === 'none' ? (
              <EmptyState
                tone="setup"
                title="No days have been closed out yet."
                detail="Production, collections, and missed appointments read straight off the deposit log."
                action={{ label: 'Open the deposit log', to: '/deposit-log' }}
                compact
              />
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {brief.facts.filter(f => f.id !== 'np-scheduled').map(f => (
                  <div key={f.id} className="min-w-0">
                    <dt className="text-[13px] font-semibold text-muted-foreground">{f.label}</dt>
                    <dd className={cn('mt-0.5 font-display text-[1.35rem] font-bold leading-none tabular-nums tracking-[-0.02em]', f.tone === 'attention' ? toneText.attention : f.tone === 'urgent' ? toneText.urgent : 'text-foreground')}>{f.value}</dd>
                    {f.detail && <dd className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{f.detail}</dd>}
                  </div>
                ))}
              </dl>
            )}
          </Panel>

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

          {(liveRoster || exceptions.length > 0) && (
            <Panel
              title="Staffing today"
              count={liveRoster ? staffing.rows.length : undefined}
              countTone="calm"
              action={{ label: 'Attendance', to: '/management/attendance' }}
            >
              {exceptions.map(s => <SignalRow key={s.id} signal={s} />)}
              {liveRoster && staffing.rows.map(p => <PersonRow key={p.id} person={p} />)}
            </Panel>
          )}
        </div>
      </div>

      {/* 4 — the performance block. */}
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

      <div className="mt-4 space-y-4">
        <Lanes lanes={lanes} />
        <ToolsPanel groups={toolGroups} />
      </div>

    </DashboardShell>
  );
}
