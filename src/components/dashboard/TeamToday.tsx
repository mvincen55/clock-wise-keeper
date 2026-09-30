import type { HomeSummary, TodayBand, Signal } from './types';
import { Panel, SignalRow } from './kit';
import { Roster } from './Summary';
import { ExceptionRow, todayLine } from './TodayPanel';

/** Attendance has one home, with the complete roster available on demand. */
export function TeamToday({ summary, today, signals = [] }: { summary: HomeSummary; today: TodayBand; signals?: Signal[] }) {
  const people = summary.who.flatMap(group => group.people.map(person => ({ ...person, group: group.label })));
  return <Panel title="Team today" action={{ label: 'People', to: '/management/people' }}>
    <p className="pb-2 text-sm text-muted-foreground">{todayLine(today)}</p>
    {signals.map(signal => <SignalRow key={signal.id} signal={signal} />)}
    {today.exceptions.map(person => <ExceptionRow key={person.id} person={person} />)}
    {people.length > 0 && <details className="mt-3"><summary className="min-h-8 cursor-pointer text-sm font-medium text-primary">View team · {people.length}</summary><Roster people={people} /></details>}
  </Panel>;
}
