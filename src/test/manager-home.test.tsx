/** Manager dashboard: financial context, the real attention queue, chosen goals,
 * one team roster, and navigation into the existing workflows. */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import {
  managerAttendanceFixture, managerClosedFixture, managerFixture, managerFrontDeskFixture, managerNewFixture, managerOffPaceFixture,
} from '@/components/dashboard/fixtures';
import { entryCount, groupAttention } from '@/lib/attention';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('the summary', () => {
  it('leads with the state of the office and its genuine priorities, each one linked', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    const { summary } = managerFixture.home;
    expect(summary.headline).toBe('Open · 4 of 8 in');
    expect(summary.detail).toBe('Workday runs until 5:00 PM · Sam K. at 1:00 PM.');
    expect(summary.lines.map(l => l.id)).toEqual(['payroll']);
    expect(screen.getByText('Payroll hours are due Thu · 1 open time record.')).toHaveAttribute('href', '/management/payroll');
    expect(container.textContent!.indexOf('How we’re doing')).toBeLessThan(container.textContent!.indexOf('Team today'));
    // Routine lateness and the queue's own count never headline.
    expect(container.textContent).not.toMatch(/came in late|things need you/);
  });

  it('never renders a missing closeout as zeros', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    expect(container.textContent).not.toContain('$0');
  });
});

describe('the financial picture', () => {
  it('shows month totals, target progress, the chart, and useful observations', () => {
    renderView(<ManagerDashboard view={managerFixture} chartWidth={700} />);
    expect(screen.getByRole('button', { name: 'This month', pressed: true })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Production' })).getByText('$7,420')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Production goal progress' })).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByRole('meter', { name: 'Collections goal progress' })).toHaveAttribute('aria-valuenow', '4');
    expect(screen.getByRole('region', { name: 'Collections over time' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Worth a look')).toBeInTheDocument();
  });

  it('carries the primary actions in the header, on existing routes', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(screen.getAllByRole('link', { name: /Create FOF/ })[0]).toHaveAttribute('href', '/fof');
    expect(screen.getAllByRole('link', { name: /^Close the Day$/ })[0]).toHaveAttribute('href', '/deposit-log');
  });

  it('the totals and targets follow the chosen month or year', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(within(screen.getByRole('region', { name: 'Production' })).getByText('$7,420')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Year to date' }));
    expect(within(screen.getByRole('region', { name: 'Production' })).getByText('Annualized monthly target · $1,920,000')).toBeInTheDocument();
  });

  it('does not repeat the period totals in a separate daily closeout panel', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(screen.queryByRole('region', { name: "Yesterday's closeout" })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByText('Close the Day saved, not sealed · 2026-03-02')).toBeInTheDocument();
  });
});

describe('needs you', () => {
  it('lists every Attention item in consequence order, with the date, the next step, why, and one navigation action each', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const keys = managerFixture.home.needs.now.map(i => i.key);
    // The payroll deadline governs first; then decisions, oldest first.
    expect(keys).toEqual(['missing_clock_out:d1', 'pto_request:p1', 'correction_request:c1', 'excuse_request:t1', 'close_day_unsealed:log-0302']);
    const rows = keys.map(k => document.querySelector(`[data-item-key="${k}"]`) as HTMLElement);
    expect(within(rows[0]).getByRole('link', { name: /^Open/ })).toHaveAttribute('href', '/management?item=missing_clock_out:d1');
    expect(within(rows[0]).getByText('payroll Thu · 2d')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Fix the punches')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: /^Review/ })).toHaveAttribute('href', '/management?item=pto_request:p1');
    expect(within(rows[1]).getByText('2d')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Approve or decline the excuse')).toBeInTheDocument();
    expect(within(rows[4]).getByText('Seal the day')).toBeInTheDocument();
    fireEvent.click(within(rows[1]).getByRole('button', { name: /Why it’s yours/ }));
    expect(within(rows[1]).getByText('A PTO request is waiting on a manager decision.')).toBeInTheDocument();
  });

  it('the count is the unique items that need the manager now, and what waits on others is apart', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const panel = screen.getByRole('region', { name: 'Needs you' });
    expect(within(panel).getByText('5')).toBeInTheDocument();
    expect(entryCount(groupAttention(managerFixture.home.needs.now))).toBe(5);
    const waiting = within(panel).getByRole('button', { name: /Waiting on others/ });
    expect(waiting).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Dana R. · Checklist bypass reason owed · 2026-02-27')).not.toBeInTheDocument();
    fireEvent.click(waiting);
    expect(screen.getByText('Dana R. · Checklist bypass reason owed · 2026-02-27')).toBeInTheDocument();
    expect(screen.getByText(/Waiting on Dana R\. · follow up/)).toBeInTheDocument();
  });

  it('repeated work folds into an expandable category whose rows still open their own records', () => {
    renderView(<ManagerDashboard view={managerAttendanceFixture} />);
    const needs = managerAttendanceFixture.home.needs.now;
    expect(needs.filter(i => i.kind === 'close_day_unsealed')).toHaveLength(3);
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByText('7')).toBeInTheDocument();
    const group = document.querySelector('[data-group-kind="close_day_unsealed"]') as HTMLElement;
    expect(within(group).getByText('Closeouts awaiting seal')).toBeInTheDocument();
    expect(within(group).getByText('3')).toBeInTheDocument();
    expect(within(group).getByText(/each one is reviewed on its own/)).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: /Open all/ })).toHaveAttribute('href', '/management?kind=close_day_unsealed');
    expect(screen.queryByText('Close the Day saved, not sealed · 2026-02-26')).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: /Closeouts awaiting seal/ }));
    for (const date of ['2026-02-26', '2026-02-27', '2026-03-02']) {
      expect(within(group).getByText(`Close the Day saved, not sealed · ${date}`).closest('a')).toHaveAttribute('href', `/management?item=close_day_unsealed:log-${date.slice(5).replace('-', '')}`);
    }
    // The panel count still equals the unique items — nothing counted twice.
    expect(within(screen.getByRole('region', { name: 'Needs you' })).getByText('7')).toBeInTheDocument();
  });

  it('attendance reaches the queue only as a decision or a report, never as a routine late arrival', () => {
    const { container } = renderView(<ManagerDashboard view={managerAttendanceFixture} />);
    const excuse = document.querySelector('[data-item-key="excuse_request:t1"]') as HTMLElement;
    expect(within(excuse).getByRole('link', { name: /^Review/ })).toBeInTheDocument();
    expect(within(excuse).getByText('“School drop-off ran long”')).toBeInTheDocument();
    const meeting = document.querySelector('[data-item-key="attendance_meeting:i7"]') as HTMLElement;
    expect(within(meeting).getByText('Ken W. · Meet with team member · attendance report')).toBeInTheDocument();
    expect(within(meeting).getByText('Meet, then sign')).toBeInTheDocument();
    // Marcus arrived late and is simply in: not an exception, not a headline.
    expect(managerAttendanceFixture.home.today.exceptions.map(e => e.name)).toEqual(['Ken W.', 'Jo B.']);
    expect(container.textContent).not.toMatch(/came in late/);
    expect(managerAttendanceFixture.home.summary.lines.map(l => l.id)).toEqual(['payroll']);
  });

  it('carries no consequential action — Home only navigates; its buttons are chart, period, and disclosure controls', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    expect(container.querySelectorAll('form, input, textarea')).toHaveLength(0);
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(b => b.hasAttribute('data-home-control'))).toBe(true);
    for (const b of buttons) expect(b.textContent).not.toMatch(/\bApprove\b|\bSeal\b|\bSign off\b|\bDeny\b/);
  });

  it('a clear office says so once — no zero rows', () => {
    renderView(<ManagerDashboard view={managerNewFixture} />);
    expect(screen.getByText(/Nothing is waiting on you\./)).toBeInTheDocument();
    expect(screen.queryByText(/more need/)).not.toBeInTheDocument();
  });
});

describe('today', () => {
  it('puts exceptions, the count, and the expandable roster in one team panel', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const today = screen.getByRole('region', { name: 'Team today' });
    expect(managerFixture.home.today.exceptions.map(e => e.name)).toEqual(['Ken W.', 'Jo B.']);
    expect(within(today).getByText('4 in · Sam K. at 1:00 PM')).toBeInTheDocument();
    const roster = within(today).getByRole('list', { name: 'Who is where' });
    expect(within(roster).getByText('Marcus T.')).toBeInTheDocument();
    const exceptions = within(today).getAllByText('Ken W.').filter(e => !roster.contains(e));
    expect(exceptions[0].closest('a')).toHaveAttribute('href', '/management?item=missing_clock_out:d1');
  });

  it('a closed office never invents absences', () => {
    const { container } = renderView(<ManagerDashboard view={managerClosedFixture} />);
    expect(container.textContent).not.toMatch(/not in yet/i);
    expect(screen.queryByText(/on the floor/i)).not.toBeInTheDocument();
  });
});

describe('status and pace', () => {
  it('an unsealed closeout is a queue item, so the status list does not repeat it', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(managerFixture.home.lastDay).toMatchObject({ label: "Yesterday's closeout", text: 'saved, not sealed', action: 'Open' });
    expect(screen.queryByRole('region', { name: 'Status' })).not.toBeInTheDocument();
    expect(screen.getByText('Close the Day saved, not sealed · 2026-03-02').closest('a')).toHaveAttribute('href', '/management?item=close_day_unsealed:log-0302');
  });

  it('flags a metric behind pace in the meters only, and says what changed in worth a look', () => {
    const { container } = renderView(<ManagerDashboard view={managerOffPaceFixture} chartWidth={800} />);
    const meters = managerOffPaceFixture.goalMeters!;
    expect(meters.map(m => [m.id, m.verdict, m.completeness])).toEqual([['production', 'behind', 'complete'], ['collections', 'behind', 'complete']]);
    expect(screen.getAllByText(/Below expected pace/)).toHaveLength(2);
    // The observation is the comparison, not the verdict the meter already gave.
    expect(managerOffPaceFixture.insights!.map(i => i.id)).toEqual(['collections_down', 'missed_falling']);
    expect(managerOffPaceFixture.insights!.every(i => i.basis === 'observed')).toBe(true);
    expect(container.textContent).not.toMatch(/behind calendar pace for March/);
    expect(screen.getByText(/Collections per recorded day are \d+% below the same days last month\./)).toBeInTheDocument();
  });
});

describe('the challenge in the board', () => {
  it('shows the chosen office goal once with its actual progress and state', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const goal = screen.getByRole('region', { name: 'Office goal' });
    expect(within(goal).getByText('On track')).toBeInTheDocument();
    expect(within(goal).getByRole('meter', { name: 'Morning huddle on time: 9 of 10' })).toBeInTheDocument();
    expect(screen.getAllByText('Morning huddle on time')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Team member goal' })).toBeInTheDocument();
  });

  it('a challenge off track carries its state as the chip; the spotlight reason stays a pure fact', () => {
    renderView(<ManagerDashboard view={managerOffPaceFixture} />);
    expect(managerOffPaceFixture.home.spotlight?.reason).toBe('off track');
    const month = screen.getByRole('region', { name: 'Office goal' });
    expect(within(month).getByText('Needs a push')).toBeInTheDocument();
    expect(screen.getAllByText('Recall reactivation')).toHaveLength(1);
  });
});

describe('after close', () => {
  it('after close keeps closeout and inbox actions in Before you leave, attendance in Team today', () => {
    renderView(<ManagerDashboard view={managerClosedFixture} />);
    const queue = screen.getByRole('region', { name: 'Before you leave' });
    expect(within(queue).getByText("Today's closeout")).toBeInTheDocument();
    expect(within(queue).getByText('1 doctor notes still needs a reply before closeout').closest('a')).toHaveAttribute('href', '/inbox/requests');
    expect(within(queue).queryByText('Still clocked in')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Team today' })).getByText('Still clocked in')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Needs you' })).not.toBeInTheDocument();
  });
});

describe('brand-new office', () => {
  it('a new office offers setup and record entry without invented zeros or percentages', () => {
    const { container } = renderView(<ManagerDashboard view={managerNewFixture} />);
    expect(screen.getByText('No comparable history recorded for these dates yet.')).toBeInTheDocument();
    expect(screen.getAllByText('No goal set')).toHaveLength(2);
    expect(screen.getByText('No office days have been closed out yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Close out a day/ })[0]).toHaveAttribute('href', '/deposit-log');
    expect(container.textContent).not.toMatch(/\$0|\b0 now\b|%/);
  });
});

describe('roles and tools', () => {
  it('a manager covering the front desk today sees that lane’s urgent work and its tools first', () => {
    renderView(<ManagerDashboard view={managerFrontDeskFixture} />);
    expect(screen.getByRole('region', { name: 'Covering today · Office manager' })).toBeInTheDocument();
    const tools = screen.getByRole('region', { name: 'Tools' });
    const text = tools.textContent!;
    expect(text.indexOf('Front desk')).toBeLessThan(text.indexOf('Office manager'));
    expect(text.indexOf('Office manager')).toBeLessThan(text.indexOf('Management'));
  });

  it('the manager’s own items sit under Mine, apart from the office’s queue', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const mine = screen.getByRole('region', { name: 'Mine' });
    expect(within(mine).getByText('Read and sign · Sterilization log')).toBeInTheDocument();
  });
});
