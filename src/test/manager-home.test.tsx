/**
 * Manager Home composition — the briefing (design §3.3).
 *
 *  - one sentence of state leads, built from recorded facts, each one linked;
 *  - Needs you is the first three Attention items with one navigation action
 *    each (Review for a decision, Open otherwise), then "n more";
 *  - Today lists exceptions and one count line, never a roster;
 *  - the status lines name the last closeout and the pace with a Why?;
 *  - the challenge appears only when it is noteworthy;
 *  - after close, Needs you becomes Before you leave;
 *  - a brand-new office gets honest lines, not a wall of zeros;
 *  - Home carries no consequential action: no Approve, Seal, or Sign off.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    expect(container.textContent).not.toContain('$0');
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

  it('carries no consequential action — Home only navigates', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    expect(container.querySelectorAll('button, form, input, textarea, select')).toHaveLength(0);
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

describe('status lines', () => {
  it('name the last closeout and where it stands, and the pace with its scope and a Why?', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(managerFixture.home.lastDay).toMatchObject({ label: "Yesterday's closeout", text: 'saved, not sealed', action: 'Open' });
    expect(screen.getByText("Yesterday's closeout").closest('a')).toHaveAttribute('href', '/management?item=close_day_unsealed:log-0302');
    const pace = managerFixture.home.pace!;
    expect(pace.scope).toBe("through yesterday's closeout");
    expect(screen.getByText(pace.text)).toBeInTheDocument();
    expect(screen.getByText('Why?')).toBeInTheDocument();
    // The receipts are the shared layer's own figures — none is hand-typed.
    for (const f of pace.figures) expect(screen.getAllByText(f.value).length).toBeGreaterThan(0);
  });

  it('flags a metric behind pace by name', () => {
    renderView(<ManagerDashboard view={managerOffPaceFixture} />);
    const pace = managerOffPaceFixture.home.pace!;
    expect(pace.tone).toBe('attention');
    expect(pace.text).toMatch(/collections/);
    expect(screen.getByText(pace.text)).toBeInTheDocument();
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
    const { container } = renderView(<ManagerDashboard view={managerNewFixture} />);
    expect(screen.getByText('Last closeout').closest('a')).toHaveAttribute('href', '/deposit-log');
    expect(screen.getByText('none on record in the last two weeks')).toBeInTheDocument();
    expect(screen.getByText('No days have been closed out yet; pace reads from Close the Day.')).toBeInTheDocument();
    expect(container.textContent).not.toContain('$0');
    expect(container.textContent).not.toMatch(/\b0 now\b/);
  });
});
