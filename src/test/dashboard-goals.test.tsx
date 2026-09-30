import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { chosenGoalsFrom } from '@/lib/dashboard-goals';
import type { Goal, GoalTask } from '@/hooks/useGoals';
import { ChosenGoals } from '@/components/dashboard/ChosenGoals';
import { managerFixture } from '@/components/dashboard/fixtures';

const goal = (id: string, user: string, over: Partial<Goal> = {}): Goal => ({ id, org_id: 'a', user_id: user, title: `Goal ${id}`, description: null, smart_target: 'Ask for feedback 4 times', month: '2026-03', status: 'active', visibility: 'team', created_at: '', updated_at: '', created_by: user, ...over });
const task = (id: string, goal_id: string, done = false, org_id = 'a'): GoalTask => ({ id, org_id, goal_id, done, title: 'One step', done_at: null, due_date: null, sort_order: 0, training_module_id: null });
const args = { orgId: 'a', viewerId: 'me', viewerName: 'Me', admin: true, month: '2026-03', state: 'ok' as const,
  goals: [goal('mine', 'me'), goal('alice', 'alice', { visibility: 'private' }), goal('wrong-office', 'me', { org_id: 'b' }), goal('old', 'me', { month: '2026-02' }), goal('archived', 'me', { status: 'archived' })],
  tasks: [task('1', 'mine', true), task('2', 'mine'), task('3', 'mine', true, 'b'), task('4', 'alice', true)],
  people: [{ user_id: 'alice', display_name: 'Alice' }, { user_id: 'me', display_name: 'Me' }, { user_id: 'bob', display_name: 'Bob' }],
};

describe('chosen goals from real goal and task records', () => {
  it('scopes goals and steps to this office and month, ignoring archived goals', () => {
    const d = chosenGoalsFrom(args);
    expect(d.goals.map(g => g.id)).toEqual(['mine', 'alice']);
    expect(d.goals[0]).toMatchObject({ done: 1, total: 2, target: 'Ask for feedback 4 times', completed: false });
    expect(d.goals[1].private).toBe(true);
  });
  it('members see only their own goal, even if a cache contains an admin response', () => {
    const d = chosenGoalsFrom({ ...args, admin: false });
    expect(d.goals.map(g => g.id)).toEqual(['mine']); expect(d.people).toEqual([{ userId: 'me', name: 'Me' }]);
  });
  it('no tasks means no numeric progress, not zero achievement against the written SMART target', () => {
    const d = chosenGoalsFrom({ ...args, tasks: [] });
    expect(d.goals[0]).toMatchObject({ done: 0, total: 0, target: 'Ask for feedback 4 times' });
    render(<MemoryRouter><ChosenGoals data={d} officeGoal={null} admin /></MemoryRouter>);
    expect(screen.getByText('No steps added yet')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });
});

describe('selecting a team member', () => {
  it('changes only the personal goal and leaves the office goal in place', () => {
    render(<MemoryRouter><ChosenGoals data={chosenGoalsFrom(args)} officeGoal={managerFixture.goal} admin /></MemoryRouter>);
    expect(screen.getByText('Goal mine')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Team member' }), { target: { value: 'alice' } });
    expect(screen.getByText('Goal alice')).toBeInTheDocument(); expect(screen.queryByText('Goal mine')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 1 steps complete')).toBeInTheDocument();
    expect(screen.getAllByText(managerFixture.goal!.title)).toHaveLength(1);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bob' } });
    expect(screen.getByText('No goal chosen for this month.')).toBeInTheDocument();
  });
  it('a member has no people selector and cannot render another person’s private goal', () => {
    render(<MemoryRouter><ChosenGoals data={chosenGoalsFrom(args)} officeGoal={managerFixture.goal} admin={false} /></MemoryRouter>);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Goal mine')).toBeInTheDocument(); expect(screen.queryByText('Goal alice')).not.toBeInTheDocument();
  });
  it('distinguishes loading and errors from an empty goal', () => {
    const d = chosenGoalsFrom(args);
    const { rerender } = render(<MemoryRouter><ChosenGoals data={{ ...d, state: 'loading' }} officeGoal={null} admin /></MemoryRouter>);
    expect(screen.getByText('Reading chosen goals…')).toBeInTheDocument();
    rerender(<MemoryRouter><ChosenGoals data={{ ...d, state: 'error' }} officeGoal={null} admin /></MemoryRouter>);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
    expect(screen.queryByText('No goal chosen for this month.')).not.toBeInTheDocument();
  });
});
