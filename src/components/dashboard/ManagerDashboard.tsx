import { useState } from 'react';
import type { Period } from '@/lib/performance-series';
import type { ManagerView } from './types';
import { ActionLink, DashboardShell, HomeHeader, Lanes, Panel, ToolsPanel, ViewContext } from './kit';
import { NeedsYouPanel } from './NeedsYou';
import { MyWorkPanel } from './MyWork';
import { StatusRow } from './CloseoutPanel';
import { ChosenGoals } from './ChosenGoals';
import { TeamToday } from './TeamToday';
import { BriefPriorities } from './Summary';
import { PracticePerformance } from './performance/PracticePerformance';
import { Noticing } from './performance/Noticing';
import { MissedTrend, missedHref } from './performance/MissedTrend';

export default function ManagerDashboard({ view, chartWidth }: { view: ManagerView; chartWidth?: number }) {
  const { header, office, home, mine, goal, lanes, roleContext, toolGroups, performance, performanceState, insights, tools } = view;
  const [period, setPeriod] = useState<Period | null>(null);
  const closeAction = tools.find(t => t.id === 'close');
  const fofAction = tools.find(t => t.id === 'fof');
  const lead = home.wrapUp && (home.lastDay?.action || home.inbox) ? <div className="mb-3">{home.lastDay?.action && <StatusRow line={home.lastDay} />}{home.inbox && <StatusRow line={home.inbox} />}</div> : undefined;
  return (
    <DashboardShell>
      <HomeHeader greeting={header.personName} officeName={header.officeName} dateLabel={header.dateLabel} timeLabel={header.timeLabel}
        state={{ text: office.headline, tone: home.summary.tone }} context={<ViewContext context={roleContext} />}
        actions={<>{fofAction && <ActionLink to={fofAction.to} variant="secondary">{fofAction.label}</ActionLink>}{closeAction && <ActionLink to={closeAction.to} variant="primary">{closeAction.label}</ActionLink>}</>} />
      <div className="mt-5 space-y-5">
        <PracticePerformance data={performance} state={performanceState} chartWidth={chartWidth} onPeriodChange={setPeriod}
          aside={<NeedsYouPanel preview={2} needs={home.needs} title={home.wrapUp ? 'Before you leave' : 'Needs you'} emptyTitle={home.wrapUp ? 'Nothing carries into tomorrow.' : 'Nothing is waiting on you.'} emptyDetail="Decisions, fixes, and follow-ups are all clear." lead={<><BriefPriorities summary={home.summary} />{lead}</>} />} />
        <ChosenGoals data={view.chosenGoals} officeGoal={goal} admin />
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            <Panel title="Worth a look"><Noticing insights={insights} loading={performanceState === 'loading'} /></Panel>
            {performance && period && <Panel title="Cancellations and no-shows" description={period.rangeLabel} action={{ label: 'Missed appointments', to: missedHref(period) }}><MissedTrend period={period} data={performance} width={chartWidth} /></Panel>}
          </div>
          <div className="min-w-0 space-y-4">
            <TeamToday summary={home.summary} today={home.today} />
            {(mine.now.length > 0 || mine.waiting.length > 0) && <MyWorkPanel work={mine} title="Mine" emptyTitle="Nothing is assigned to you personally." emptyDetail="" id="mine" />}
          </div>
        </div>
        <Lanes lanes={lanes} />
        <details><summary className="w-fit cursor-pointer py-2 text-sm font-semibold text-primary">All tools</summary><ToolsPanel groups={toolGroups} /></details>
      </div>
    </DashboardShell>
  );
}
