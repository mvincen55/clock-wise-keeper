import { useId, useState } from 'react';
import { Flag, UsersRound } from 'lucide-react';
import type { ChosenGoals as GoalData } from '@/lib/dashboard-goals';
import { dashboardDate } from '@/lib/dashboard-performance';
import type { GoalBrief } from './types';
import { ActionLink, Chip, LoadingLines, focusRing, panelClass } from './kit';
import { challengeTone } from './ChallengeCard';
import { cn } from '@/lib/utils';

function GoalProgress({ done, total, label, office = false }: { done: number; total: number; label: string; office?: boolean }) {
  const pct = total > 0 ? Math.round(done / total * 100) : null;
  return <>
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
      <p className="text-[25px] font-semibold leading-none tabular-nums tracking-tight">{done}<span className="ml-1 text-sm font-normal text-muted-foreground"> / {total}</span></p>
      {pct !== null && <span className="text-xs text-muted-foreground">{pct}% complete</span>}
    </div>
    <div className={cn('mt-3 h-2 rounded-full', office ? 'bg-card' : 'bg-muted')} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
    </div>
  </>;
}

export function ChosenGoals({ data, officeGoal, admin }: { data?: GoalData; officeGoal: GoalBrief | null; admin: boolean }) {
  const [selection, setSelection] = useState('');
  const selectId = useId();
  const people = data?.people ?? [];
  const selected = people.some(p => p.userId === selection) ? selection
    : people.find(p => p.userId === data?.viewerId)?.userId ?? people.find(p => data?.goals.some(g => g.userId === p.userId))?.userId ?? people[0]?.userId;
  const goals = data?.goals.filter(g => g.userId === (admin ? selected : data.viewerId)) ?? [];
  const month = data ? new Date(`${data.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'This month';
  const card = cn(panelClass, 'flex min-w-0 flex-col p-[17px]');
  return (
    <section aria-label="Chosen goals" className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">Active goals</h2><p className="text-xs text-muted-foreground">{month}</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Office goal" className={cn(card, 'border-primary/10 bg-[var(--home-goal-surface)]')}>
          <header className="flex min-h-9 flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-semibold"><Flag className="h-4 w-4 text-primary" aria-hidden />Office goal</h3><span className="rounded bg-card/40 px-2 py-1 text-[11px] text-primary">Whole office</span></header>
          {officeGoal ? <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-[15px] font-semibold">{officeGoal.title}</h4><Chip tone={challengeTone(officeGoal)}>{officeGoal.stateLabel}</Chip></div>
            <GoalProgress done={officeGoal.done} total={officeGoal.total} label={`${officeGoal.title}: ${officeGoal.done} of ${officeGoal.total}`} office />
            <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
              <div><p className="text-xs font-semibold">{officeGoal.remaining} to go</p><p className="mt-1 text-[11px] text-muted-foreground">Due {dashboardDate(officeGoal.endsOn)}{officeGoal.daysLeft > 0 ? ` · ${officeGoal.daysLeft} days left` : ''}</p></div>
              <ActionLink to={admin && officeGoal.state === 'awaiting_verification' ? `/management?item=challenge_verify:${officeGoal.id}` : '/goals'} variant="text" size="sm" className="!text-xs">{admin && officeGoal.state === 'awaiting_verification' ? 'Review' : 'Goal details'}</ActionLink>
            </div>
            <details className="mt-2 text-[11px] text-muted-foreground"><summary className={cn('w-fit cursor-pointer rounded py-1', focusRing)}>Goal progress details</summary><p>{officeGoal.stateDetail}</p></details>
            {officeGoal.moreCount > 0 && <ActionLink to="/goals" variant="text" size="sm" className="mt-1 !text-xs">{officeGoal.moreCount} more active</ActionLink>}
          </> : <div className="py-5"><p className="text-sm text-muted-foreground">No office goal is running.</p>{admin && <ActionLink to="/goals" variant="text" size="sm" className="mt-2">Choose a goal</ActionLink>}</div>}
        </section>
        <section aria-label={admin ? 'Team member goal' : 'My chosen goal'} className={card}>
          <header className="flex min-h-9 flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold"><UsersRound className="h-4 w-4 text-primary" aria-hidden />{admin ? 'Team member goal' : 'My chosen goal'}</h3>
            {admin && people.length > 0 && <><label htmlFor={selectId} className="sr-only">Team member</label><select id={selectId} aria-label="Team member" value={selected} onChange={e => setSelection(e.target.value)} className={cn('min-h-9 max-w-full rounded-lg border border-border bg-background px-2 text-xs font-medium sm:max-w-[55%]', focusRing)}>{people.map(person => <option key={person.userId} value={person.userId}>{person.name}</option>)}</select></>}
          </header>
          {data?.state === 'loading' ? <LoadingLines label="Reading chosen goals…" lines={2} /> : data?.state === 'error' ? <p className="py-3 text-sm text-muted-foreground">Chosen goals could not be read. Open Goals to try again.</p> : goals.length ? (
            <div className="flex flex-1 flex-col divide-y divide-border">{goals.map(goal => <div key={goal.id} className="flex flex-1 flex-col py-3 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-[15px] font-semibold">{goal.title}</h4>{goal.completed && <Chip tone="steady">Completed</Chip>}</div>
              {goal.target && <p className="mt-1.5 text-xs text-muted-foreground">{goal.target}</p>}
              {goal.total > 0 ? <><GoalProgress done={goal.done} total={goal.total} label={`${goal.title} steps`} /><p className="mt-1.5 text-[11px] text-muted-foreground">{goal.done} of {goal.total} steps complete</p></> : <p className="mt-3 text-sm text-muted-foreground">No steps added yet</p>}
              <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
                <div>{goal.total > 0 && <p className="text-xs font-semibold">{Math.max(0, goal.total - goal.done)} steps to go</p>}<p className="mt-1 text-[11px] text-muted-foreground">Due {dashboardDate(goal.endsOn)}{goal.private ? ' · Private goal' : ''}</p></div>
                <ActionLink to="/goals" variant="text" size="sm" className="!text-xs">Goal details</ActionLink>
              </div>
            </div>)}</div>
          ) : <div className="py-5"><p className="text-sm text-muted-foreground">{admin ? 'No goal chosen for this month.' : 'Choose what you want to work toward this month.'}</p>{!admin && <ActionLink to="/goals" variant="text" size="sm" className="mt-2">Choose my goal</ActionLink>}</div>}
        </section>
      </div>
    </section>
  );
}
