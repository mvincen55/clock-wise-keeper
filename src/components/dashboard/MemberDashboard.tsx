import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { MemberView } from './types';
import { ActionLink, DashboardShell, FigureStrip, HomeHeader, Lanes, Panel, SignalRow, StatusDot, ToolsPanel, ViewContext, focusRing, interactive } from './kit';
import { MyWorkPanel } from './MyWork';
import { GoalMeterRow } from './performance/GoalMeters';
import { ChosenGoals } from './ChosenGoals';

/** Shared office targets, the member's own chosen goal, then their work and time. */
export default function MemberDashboard({ view }: { view: MemberView; chartWidth?: number }) {
  const { header, work, rolePulse, goal, status, utilities, lanes, roleContext, toolGroups, attendanceStanding, performanceState, goalMeters } = view;
  const patients = view.performance?.visibility.newPatients ? view.performance : null;
  return (
    <DashboardShell>
      <HomeHeader greeting={header.personName} officeName={header.officeName} dateLabel={header.dateLabel} timeLabel={header.timeLabel}
        state={{ text: status.label, tone: status.tone }} context={<ViewContext context={roleContext} />}
        actions={<ActionLink to="/timesheet" variant="secondary">Timesheet</ActionLink>} />
      <div className="mt-5 space-y-5">
        {((goalMeters && goalMeters.length > 0) || patients) && <Panel title="Our office goals this month" className="border-primary/25 bg-primary/[0.035]" action={{ label: 'Goals', to: '/goals' }}>
          <div className="[container-type:inline-size]"><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{goalMeters?.map(meter => <GoalMeterRow key={meter.id} meter={meter} canSetGoals={false} variant="tile" />)}{patients && <div><p className="text-sm font-semibold text-muted-foreground">New patients seen</p><p className="mt-2 text-2xl font-bold tabular-nums">{patients.thisMonth.newPatientsSeenRecordedDays > 0 ? patients.thisMonth.newPatientsSeen : 'Not recorded'}{patients.targets.newPatientsSeen > 0 && <span className="ml-2 text-sm font-medium text-muted-foreground">of {patients.targets.newPatientsSeen} this month</span>}</p></div>}</div></div>
          <p className="mt-3 text-xs text-muted-foreground">Office totals update after Close the Day.</p>
          {performanceState === 'error' && <p className="mt-3 text-sm text-muted-foreground">Some records could not be read. Refresh to try again.</p>}
        </Panel>}
        <ChosenGoals data={view.chosenGoals} officeGoal={goal} admin={false} />
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.6fr)]">
          <MyWorkPanel work={work} emptyTitle="You’re clear. Nothing is assigned to you right now." emptyDetail="New items will appear here and in your inbox." />
          <div className="min-w-0 space-y-4">
            <Panel title="My time & PTO" action={{ label: 'Timesheet', to: '/timesheet' }}>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pb-3"><StatusDot tone={status.tone} /><p className="text-[15px] font-medium">{status.label}</p><p className="min-w-0 flex-1 text-[13px] text-muted-foreground">{status.detail}</p></div>
              <FigureStrip figures={utilities} />
              {attendanceStanding && <Link to={attendanceStanding.href} className={cn('mt-3 flex items-center gap-2 rounded-md text-[13.5px] text-muted-foreground hover:text-foreground', interactive, focusRing)}><StatusDot tone={attendanceStanding.tone} />{attendanceStanding.text}</Link>}
            </Panel>
            {rolePulse.length > 0 && <Panel title="For my role">{rolePulse.map(item => <SignalRow key={item.id} signal={item} />)}</Panel>}
          </div>
        </div>
        <Lanes lanes={lanes} />
        <details><summary className="w-fit cursor-pointer py-2 text-sm font-semibold text-primary">All tools</summary><ToolsPanel groups={toolGroups} /></details>
      </div>
    </DashboardShell>
  );
}
