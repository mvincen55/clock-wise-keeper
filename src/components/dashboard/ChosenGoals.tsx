import { useId, useState } from 'react';
import type { ChosenGoals as GoalData } from '@/lib/dashboard-goals';
import { dashboardDate } from '@/lib/dashboard-performance';
import type { GoalBrief } from './types';
import { ActionLink, Chip, LoadingLines, Panel, focusRing } from './kit';
import { ChallengeCard } from './ChallengeCard';

export function ChosenGoals({ data, officeGoal, admin }: { data?: GoalData; officeGoal: GoalBrief | null; admin: boolean }) {
  const [selection, setSelection] = useState('');
  const selectId = useId();
  const people = data?.people ?? [];
  const selected = people.some(p => p.userId === selection) ? selection
    : people.find(p => p.userId === data?.viewerId)?.userId ?? people.find(p => data?.goals.some(g => g.userId === p.userId))?.userId ?? people[0]?.userId;
  const goals = data?.goals.filter(g => g.userId === (admin ? selected : data.viewerId)) ?? [];
  const month = data ? new Date(`${data.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'This month';
  return (
    <section aria-label="Chosen goals" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">Goals we’re working toward</h2><p className="text-xs text-muted-foreground">{month}</p></div>
      {!officeGoal && <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground"><span>No office goal is running.</span>{admin && <ActionLink to="/goals" variant="text" size="sm">Choose a goal</ActionLink>}</div>}
      <div className={officeGoal ? 'grid items-start gap-4 lg:grid-cols-2' : ''}>
        {officeGoal && <Panel title="Office goal" className="border-primary/20 bg-primary/[0.025]" action={{ label: 'View goal', to: '/goals' }}><ChallengeCard goal={officeGoal} reviewHref={admin ? `/management?item=challenge_verify:${officeGoal.id}` : undefined} /></Panel>}
        <Panel title={admin ? 'Team member goal' : 'My chosen goal'} action={{ label: 'Goals', to: '/goals' }} aside={admin && people.length > 0 ? <label htmlFor={selectId} className="sr-only">Team member</label> : undefined}>
          {admin && people.length > 0 && <select id={selectId} aria-label="Team member" value={selected} onChange={e => setSelection(e.target.value)} className={`mb-3 min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium ${focusRing}`}>{people.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select>}
          {data?.state === 'loading' ? <LoadingLines label="Reading chosen goals…" lines={2} /> : data?.state === 'error' ? <p className="py-3 text-sm text-muted-foreground">Chosen goals could not be read. Open Goals to try again.</p> : goals.length ? (
            <div className="divide-y divide-border">{goals.map(goal => <div key={goal.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">{goal.title}</h3><Chip tone={goal.completed ? 'steady' : 'calm'}>{goal.completed ? 'Completed' : 'In progress'}</Chip></div>
              {goal.target && <p className="mt-2 text-sm text-muted-foreground">{goal.target}</p>}
              {goal.total > 0 ? <><p className="mt-3 text-sm font-semibold">{goal.done} of {goal.total} steps complete</p><div className="mt-2 h-2.5 rounded-full bg-muted" role="meter" aria-label={`${goal.title} steps`} aria-valuemin={0} aria-valuemax={goal.total} aria-valuenow={goal.done}><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, goal.done / goal.total * 100)}%` }} /></div></> : <p className="mt-3 text-sm text-muted-foreground">No steps added yet</p>}
              <p className="mt-2 text-xs text-muted-foreground">Through {dashboardDate(goal.endsOn)}{goal.private ? ' · Private goal' : ''}</p>
            </div>)}</div>
          ) : <div className="py-2"><p className="text-sm text-muted-foreground">{admin ? 'No goal chosen for this month.' : 'Choose what you want to work toward this month.'}</p>{!admin && <ActionLink to="/goals" variant="text" size="sm" className="mt-2">Choose my goal</ActionLink>}</div>}
        </Panel>
      </div>
    </section>
  );
}
