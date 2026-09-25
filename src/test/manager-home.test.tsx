/**
 * Manager Home composition — the briefing (design §3.3), now with the
 * financial picture in the open instead of behind a disclosure.
 *
 *  - one sentence of state leads, built from recorded facts, each one linked;
 *  - the same strip, chart, goal meters, and observations Owner Home shows
 *    follow it — Manager Home is no longer primarily a text checklist;
 *  - Needs you is the first three Attention items with one navigation action
 *    each (Review for a decision, Open otherwise), then "n more";
 *  - Today lists exceptions and one count line, never a roster;
 *  - the status line names the last closeout; pace lives in the meters;
 *  - the challenge appears only when it is noteworthy;
 *  - after close, Needs you becomes Before you leave;
 *  - a brand-new office gets honest lines, not a wall of zeros;
 *  - Home carries no consequential action: the only buttons are chart and
 *    period controls; no Approve, Seal, or Sign off.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import {
  managerClosedFixture, managerFixture, managerNewFixture, managerOffPaceFixture,
} from '@/components/dashboard/fixtures';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('the sentence', () => {
  it('leads with the state of the office, from recorded facts, each one linked', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    const text = managerFixture.home.sentence.map(p => p.text).join('');
    expect(text).toBe("Open, 4 of 8 in. Marcus T. came in late. Yesterday's closeout is saved, not sealed, and payroll hours are due Thu. 5 things need you.");
    expect(container.textContent!.indexOf('Open, 4 of 8 in')).toBeLessThan(container.textContent!.indexOf('Needs you'));
    expect(screen.getByRole('link', { name: '4 of 8 in' })).toHaveAttribute('href', '/management/people');
    expect(screen.getByRole('link', { name: "Yesterday's closeout is saved, not sealed" }))
      .toHaveAttribute('href', '/management?item=close_day_unsealed:log-0302');
    expect(screen.getByRole('link', { name: '5 things need you.' })).toHaveAttribute('href', '/management');
    expect(screen.getByRole('link', { name: 'Marcus T. came in late.' })).toHaveAttribute('href', '/management?item=tardy_unreviewed:t1');
  });

  it('never renders a missing closeout as zeros', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    expect(container.textContent).not.toContain('$0');
  });
});

describe('the financial picture is in the open', () => {
  it('the strip, the chart, the goal meters, and the observations follow the sentence', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    const text = container.textContent!;
    expect(text.indexOf('Right now')).toBeLessThan(text.indexOf('Production'));
    expect(screen.getByRole('list', { name: 'Performance strip' }).querySelectorAll('[role="listitem"]')).toHaveLength(4);
    expect(screen.getByTestId('performance-chart-frame').querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('meter', { name: /Production 5% of the \$160,000 goal/ })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: /Collections 4% of the \$150,000 goal/ })).toBeInTheDocument();
    expect(screen.getByText('What I’m noticing')).toBeInTheDocument();
    expect(text.indexOf('Production and Collections')).toBeLessThan(text.indexOf('Needs you'));
    expect(screen.getAllByText('Why?', { selector: 'summary' }).length).toBeGreaterThan(0);
  });

  it('carries the frequent tools near the top, on existing routes', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const tools = screen.getByRole('navigation', { name: 'Quick tools' });
    expect(within(tools).getAllByRole('link').map(a => a.getAttribute('href'))).toEqual(['/fof', '/fof/fees', '/deposit-log', '/report-history']);
  });

  it('the strip follows the chosen period', () => {
    renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(screen.getByRole('listitem', { name: /^Production, Mar 1 – Mar 3, 2026 · partial: \$7,420/ })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /^Missed appointments, .*: 1\./ })).toBeInTheDocument();
  });

  it('observations include the work waiting on the manager, with the payroll deadline', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(managerFixture.insights!.map(i => i.id)).toContain('work_waiting');
    expect(screen.getByText('5 items need you now, 1 more waiting on others.')).toBeInTheDocument();
    expect(screen.getByText('the oldest 2d old · payroll Thu in 2 days')).toBeInTheDocument();
  });
});

describe('needs you', () => {
  it('shows the first three Attention items in consequence order, one navigation action each', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const keys = managerFixture.home.needs.top.map(i => i.key);
    // The payroll deadline governs first; then decisions, oldest first.
    expect(keys).toEqual(['missing_clock_out:d1', 'pto_request:p1', 'correction_request:c1']);
    const rows = keys.map(k => document.querySelector(`[data-item-key="${k}"]`) as HTMLElement);
    expect(rows[0]).toHaveAttribute('href', '/management?item=missing_clock_out:d1');
    expect(within(rows[0]).getByText('Open')).toBeInTheDocument();
    expect(within(rows[0]).getByText('payroll Thu · 2d')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Review')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2d')).toBeInTheDocument();
  });

  it('collapses the rest to one count line and says what else is open', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(screen.getByText('2 more need you now')).toBeInTheDocument();
    expect(screen.getByText('1 waiting on others')).toHaveAttribute('href', '/management');
    expect(screen.getByText('5 now')).toBeInTheDocument();
  });

  it('carries no consequential action — Home only navigates; its buttons are chart and period controls', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    expect(container.querySelectorAll('form, input, textarea, select')).toHaveLength(0);
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(b => b.hasAttribute('data-home-control'))).toBe(true);
    expect(container.textContent).not.toMatch(/\bApprove\b|\bSeal\b|\bSign off\b|\bDeny\b/);
  });

  it('a clear office says so once — no zero rows', () => {
    renderView(<ManagerDashboard view={managerNewFixture} />);
    expect(screen.getByText(/Nothing is waiting on you\./)).toBeInTheDocument();
    expect(screen.queryByText(/more need/)).not.toBeInTheDocument();
  });
});

describe('today', () => {
  it('lists exceptions only, then one count line, and links the exception that has an item', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(managerFixture.home.today.exceptions.map(e => e.name)).toEqual(['Marcus T.', 'Ken W.', 'Jo B.']);
    // The people who are simply in are not listed: no roster on Home.
    expect(screen.queryByText('Dana R.')).not.toBeInTheDocument();
    expect(screen.queryByText('Priya S.')).not.toBeInTheDocument();
    expect(screen.getByText('4 in · Sam K. at 1:00 PM')).toBeInTheDocument();
    expect(screen.getByText('8 scheduled')).toBeInTheDocument();
    // Marcus has a tardy item and Ken a missing clock-out: each row opens that
    // item. Jo is off with no item: her row opens her record in People.
    expect(screen.getByText('Marcus T.').closest('a')).toHaveAttribute('href', '/management?item=tardy_unreviewed:t1');
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
  it('names the last closeout and where it stands', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(managerFixture.home.lastDay).toMatchObject({ label: "Yesterday's closeout", text: 'saved, not sealed', action: 'Open' });
    expect(screen.getByText("Yesterday's closeout").closest('a')).toHaveAttribute('href', '/management?item=close_day_unsealed:log-0302');
  });

  it('flags a metric behind pace by name, in the meters and in the observations', () => {
    renderView(<ManagerDashboard view={managerOffPaceFixture} chartWidth={800} />);
    const meters = managerOffPaceFixture.goalMeters!;
    expect(meters.map(m => [m.id, m.pace?.status])).toEqual([['production', 'behind'], ['collections', 'behind']]);
    expect(screen.getAllByText('Behind calendar pace')).toHaveLength(2);
    expect(screen.getByText('Collections are behind calendar pace for March.')).toBeInTheDocument();
    // The receipts are the shared layer's own figures — none is hand-typed.
    expect(screen.getByText(`${meters[1].detail}`)).toBeInTheDocument();
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
  it('Needs you becomes Before you leave: who is still in, the closeout step, the inbox line, then what carries over', () => {
    const { container } = renderView(<ManagerDashboard view={managerClosedFixture} />);
    expect(managerClosedFixture.home.wrapUp).toBe(true);
    expect(managerClosedFixture.home.sentence.map(p => p.text).join(''))
      .toBe("Closing. Sam K. is still clocked in, and today's closeout is saved, not sealed.");
    expect(screen.getByText('Before you leave')).toBeInTheDocument();
    expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
    const text = container.textContent!;
    expect(text.indexOf('Sam K.')).toBeLessThan(text.indexOf("Today's closeout"));
    expect(text.indexOf("Today's closeout")).toBeLessThan(text.indexOf('1 doctor notes still needs a reply before closeout'));
    expect(text.indexOf('doctor notes')).toBeLessThan(text.indexOf('Carries into tomorrow'));
    expect(screen.getByText('1 doctor notes still needs a reply before closeout').closest('a')).toHaveAttribute('href', '/inbox/requests');
  });
});

describe('brand-new office', () => {
  it('states what is missing, links the door, and shows no zeros', () => {
    const { container } = renderView(<ManagerDashboard view={managerNewFixture} chartWidth={800} />);
    expect(screen.getByText('Last closeout').closest('a')).toHaveAttribute('href', '/deposit-log');
    expect(screen.getByText('none on record in the last two weeks')).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded for this period.')).toBeInTheDocument();
    for (const door of screen.getAllByRole('link', { name: /Close out a day/ })) expect(door).toHaveAttribute('href', '/deposit-log');
    expect(screen.getAllByText('No goal set')).toHaveLength(2);
    expect(screen.getByText('No office days have been closed out yet.')).toBeInTheDocument();
    expect(container.textContent).not.toContain('$0');
    expect(container.textContent).not.toMatch(/\b0 now\b/);
    expect(container.textContent).not.toMatch(/%/);
  });
});
