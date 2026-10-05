import { useState, type ReactNode } from 'react';
import type { Period } from '@/lib/performance-series';
import type { OwnerView } from './types';
import { ActionLink, DashboardShell, HomeHeader, Lanes, Panel, ToolsPanel, ViewContext } from './kit';
import { NeedsYouPanel } from './NeedsYou';
import { MyWorkPanel } from './MyWork';
import { ChosenGoals } from './ChosenGoals';
import { TeamToday } from './TeamToday';
import { BriefPriorities } from './Summary';
import { PracticePerformance } from './performance/PracticePerformance';
import { Noticing } from './performance/Noticing';
import { MissedTrend, missedHref } from './performance/MissedTrend';

export default function OwnerDashboard({ view, chartWidth, campaignStrip }: { view: OwnerView; chartWidth?: number; campaignStrip?: ReactNode }) {
  const { header, office, summary, today, decisionCount, needs, mine, goal, exceptions, lanes, roleContext, toolGroups, performance, performanceState, insights, tools } = view;
  const [period, setPeriod] = useState<Period | null>(null);
  const closeAction = tools.find(t => t.id === 'close');
  return (
    <DashboardShell>
      <HomeHeader greeting={header.personName} officeName={header.officeName} dateLabel={header.dateLabel} timeLabel={header.timeLabel}
        state={{ text: office.headline, tone: summary.tone }} context={<ViewContext context={roleContext} />}
        actions={<>{closeAction && <ActionLink to={closeAction.to} variant="secondary">{closeAction.label}</ActionLink>}<ActionLink to="/management" variant="primary">Attention{decisionCount > 0 ? ` · ${decisionCount}` : ''}</ActionLink></>} />
      <div className="mt-5 space-y-5">
        {campaignStrip}
        <PracticePerformance data={performance} state={performanceState} defaultPeriod="year" chartWidth={chartWidth} onPeriodChange={setPeriod} />
        <ChosenGoals data={view.chosenGoals} officeGoal={goal} admin />
        <BriefPriorities summary={summary} />
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <NeedsYouPanel needs={needs} emptyTitle="No owner decisions are waiting." emptyDetail="Approvals, reviews, and sign-offs are clear." />
            <Panel title="Worth a look"><Noticing insights={insights} loading={performanceState === 'loading'} /></Panel>
            {performance && period && <Panel title="Cancellations and no-shows" description={period.rangeLabel} action={{ label: 'Missed appointments', to: missedHref(period) }}><MissedTrend period={period} data={performance} width={chartWidth} /></Panel>}
          </div>
          <div className="min-w-0 space-y-4">
            <TeamToday summary={summary} today={today} signals={exceptions} />
            {(mine.now.length > 0 || mine.waiting.length > 0) && <MyWorkPanel work={mine} title="Mine" emptyTitle="Nothing is assigned to you personally." emptyDetail="" id="mine" />}
          </div>
        </div>
        <Lanes lanes={lanes} />
        <details><summary className="w-fit cursor-pointer py-2 text-sm font-semibold text-primary">All tools</summary><ToolsPanel groups={toolGroups} /></details>
      </div>
    </DashboardShell>
  );
}
