/**
 * Manager Home composition — the redesigned briefing.
 *
 *  - the summary is the office state and a few genuine priorities, each
 *    linked; routine lateness is never a headline;
 *  - Needs you is the whole Attention list, grouped where work repeats,
 *    with the date, why, and the next action on every row, and the count
 *    the badge shows; items waiting on others and parked items are apart;
 *  - Today lists exceptions and one count line, never a roster;
 *  - the closeout's state has one home at a time;
 *  - the same strip, chart, goal meters, and observations Owner Home shows;
 *  - the challenge appears only when it is noteworthy;
 *  - after close, Needs you becomes Before you leave;
 *  - a brand-new office gets honest lines, not a wall of zeros;
 *  - Home carries no consequential action: every button is a chart, period,
 *    or disclosure control; no Approve, Seal, or Sign off button.
 */
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
    expect(container.textContent!.indexOf('Right now')).toBeLessThan(container.textContent!.indexOf('Needs you'));
    // Routine lateness and the queue's own count never headline.
    expect(container.textContent).not.toMatch(/came in late|things need you/);
  });

  it('never renders a missing closeout as zeros', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    expect(container.textContent).not.toContain('$0');
  });
});

describe('the financial picture', () => {
  it('the strip, the chart, the goal meters, and worth a look follow the queue', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    const text = container.textContent!;
    expect(text.indexOf('Needs you')).toBeLessThan(text.indexOf('Production and Collections'));
    expect(screen.getByRole('list', { name: 'Performance strip' }).querySelectorAll('[role="listitem"]')).toHaveLength(4);
    expect(screen.getByTestId('performance-chart-frame').querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('meter', { name: /Production 5% of the \$160,000 goal/ })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /Collections 4% of the \$150,000 goal/ })).toBeInTheDocument();
    expect(screen.getByText('Worth a look')).toBeInTheDocument();
  });

  it('carries the primary actions in the header, on existing routes', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(screen.getByRole('link', { name: /Attention · 5/ })).toHaveAttribute('href', '/management');
    expect(screen.getAllByRole('link', { name: /^Close the Day$/ })[0]).toHaveAttribute('href', '/deposit-log');
  });

  it('the strip follows the chosen period', () => {
    renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(screen.getByRole('listitem', { name: /^Production, Mar 1 – Mar 3, 2026 · partial: \$7,420/ })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /^Missed appointments, .*: 1\./ })).toBeInTheDocument();
  });

  it('the latest closeout’s facts have one home, beside the queue', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const panel = screen.getByRole('region', { name: "Yesterday's closeout" });
    expect(within(panel).getByText('$7,420')).toBeInTheDocument();
    expect(within(panel).getByText('$6,150')).toBeInTheDocument();
    expect(within(panel).getByText(/figures appear after the day is closed out/)).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: /Attention · 7/ })).toBeInTheDocument();
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
    expect(container.querySelectorAll('form, input, textarea, select')).toHaveLength(0);
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
  it('lists genuine exceptions only, then one count line, and links the exception that has an item', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(managerFixture.home.today.exceptions.map(e => e.name)).toEqual(['Ken W.', 'Jo B.']);
    // The people who are simply in — late or not — are not listed: no roster on Home.
    expect(screen.queryByText('Dana R.')).not.toBeInTheDocument();
    expect(screen.queryByText('Marcus T.')).not.toBeInTheDocument();
    expect(screen.getByText('4 in · Sam K. at 1:00 PM')).toBeInTheDocument();
    expect(screen.getByText('8 scheduled')).toBeInTheDocument();
    expect(screen.getByText('Ken W.').closest('a')).toHaveAttribute('href', '/management?item=missing_clock_out:d1');
    expect(screen.getByText('Jo B.').closest('a')).toHaveAttribute('href', '/management/people/4');
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
    expect(screen.getAllByText('Behind pace')).toHaveLength(2);
    expect(screen.getByText(meters[1].detail)).toBeInTheDocument();
    // The observation is the comparison, not the verdict the meter already gave.
    expect(managerOffPaceFixture.insights!.map(i => i.id)).toEqual(['collections_down', 'missed_falling']);
    expect(managerOffPaceFixture.insights!.every(i => i.basis === 'observed')).toBe(true);
    expect(container.textContent).not.toMatch(/behind calendar pace for March/);
    expect(screen.getByText(/Collections per recorded day are \d+% below the same days last month\./)).toBeInTheDocument();
  });
});

describe('spotlight', () => {
  it('a challenge on track with days to go stays in Office → Goals, not on Home', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    expect(managerFixture.home.spotlight).toBeNull();
    expect(container.textContent).not.toContain('Morning huddle on time');
  });

  it('a challenge off track appears once, with the reason', () => {
    renderView(<ManagerDashboard view={managerOffPaceFixture} />);
    expect(managerOffPaceFixture.home.spotlight?.reason).toBe('off track');
    expect(screen.getByText('Challenge · off track')).toBeInTheDocument();
    expect(screen.getAllByText('Recall reactivation')).toHaveLength(1);
  });
});

describe('after close', () => {
  it('Needs you becomes Before you leave: who is still in, the closeout step, the inbox line, then what carries over — said once', () => {
    const { container } = renderView(<ManagerDashboard view={managerClosedFixture} />);
    expect(managerClosedFixture.home.wrapUp).toBe(true);
    expect(managerClosedFixture.home.summary.headline).toBe('Closed for the day');
    expect(managerClosedFixture.home.summary.lines).toEqual([]);
    expect(screen.getByText('Before you leave')).toBeInTheDocument();
    expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
    const text = container.textContent!;
    expect(text.indexOf('Sam K.')).toBeLessThan(text.indexOf("Today's closeout"));
    expect(text.indexOf("Today's closeout")).toBeLessThan(text.indexOf('1 doctor notes still needs a reply before closeout'));
    expect(text.indexOf('doctor notes')).toBeLessThan(text.indexOf('Carries into tomorrow'));
    expect(screen.getByText('1 doctor notes still needs a reply before closeout').closest('a')).toHaveAttribute('href', '/inbox/requests');
    expect(text.match(/still clocked in/gi)?.length).toBe(2); // the row ("Still clocked in"), and the Today count line
  });
});

describe('brand-new office', () => {
  it('states what is missing, links the door, and shows no zeros', () => {
    const { container } = renderView(<ManagerDashboard view={managerNewFixture} chartWidth={800} />);
    const closeout = screen.getByRole('region', { name: 'Last closeout' });
    expect(within(closeout).getByText('No days have been closed out yet.')).toBeInTheDocument();
    expect(within(closeout).getByText(/None on record in the last two weeks/)).toBeInTheDocument();
    expect(within(closeout).getByRole('link', { name: /Close out a day/ })).toHaveAttribute('href', '/deposit-log');
    expect(screen.getByText('Nothing recorded for this period.')).toBeInTheDocument();
    for (const door of screen.getAllByRole('link', { name: /Close out a day/ })) expect(door).toHaveAttribute('href', '/deposit-log');
    expect(screen.getAllByText('No goal set')).toHaveLength(2);
    expect(screen.getByText('No office days have been closed out yet.')).toBeInTheDocument();
    expect(container.textContent).not.toContain('$0');
    expect(container.textContent).not.toMatch(/\b0 now\b/);
    expect(container.textContent).not.toMatch(/%/);
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
