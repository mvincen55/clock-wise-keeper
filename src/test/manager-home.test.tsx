/**
 * Manager Home composition — the rebuilt operational cockpit.
 *
 *  - the pulse leads; attendance no longer dominates the page;
 *  - the three performance cards use the canonical pace lines (same layer as
 *    Owner Home) and each paces only against its own goal;
 *  - the intervention queue is consequence-ordered with receipts;
 *  - Close the Day status links to the record;
 *  - a closed office collapses staffing into a calm summary — no invented
 *    urgency, nobody "not in yet" at 10:32 PM;
 *  - a brand-new office gets setup guidance, not a zero wall.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import {
  managerClosedFixture, managerFixture, managerNewFixture, managerOffPaceFixture,
} from '@/components/dashboard/fixtures';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('manager pulse', () => {
  it('leads with the deterministic briefing, not attendance', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    const text = container.textContent!;
    // The pulse section appears before the staffing roster in document order.
    expect(text.indexOf('Manager pulse')).toBeGreaterThan(-1);
    expect(text.indexOf('Manager pulse')).toBeLessThan(text.indexOf('Staffing today'));
  });

  it('labels financial figures as coming from the most recent closeout while open', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    // Open office, today not closed out: the brief narrates the time semantics.
    expect(screen.getByText(/figures appear after the day is closed out/i)).toBeInTheDocument();
    expect(screen.getByText("Yesterday's closeout")).toBeInTheDocument();
  });

  it('never renders a missing closeout as zeros', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    expect(container.textContent).not.toContain('$0');
  });
});

describe('office performance cards', () => {
  it('renders all three metrics from the canonical pace lines', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(screen.getByText('Production month to date')).toBeInTheDocument();
    expect(screen.getByText('Collections month to date')).toBeInTheDocument();
    expect(screen.getByText('New patients seen month to date')).toBeInTheDocument();
  });

  it('uses the exact values the shared layer computes — no drift', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    // The fixture's performance IS monthPaceLines(input) — every rendered
    // value comes from the shared layer, none is hand-typed.
    for (const line of managerFixture.performance!) {
      expect(screen.getAllByText(line.value).length).toBeGreaterThan(0);
    }
  });

  it('shows the pipeline on the new-patient card, clearly not goal progress', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(screen.getByText(/Pipeline: 5 scheduled this week/)).toBeInTheDocument();
    expect(screen.getByText(/scheduled never\s*counts toward the seen goal/)).toBeInTheDocument();
  });

  it('flags a metric behind pace with its shortfall', () => {
    renderView(<ManagerDashboard view={managerOffPaceFixture} />);
    const line = managerOffPaceFixture.performance!.find(l => l.id === 'collections')!;
    expect(line.pace?.status).toBe('behind');
    expect(screen.getByText(line.detail)).toBeInTheDocument();
  });
});

describe('what needs your hands', () => {
  it('shows one recommended intervention with receipts, then the queue', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    expect(screen.getByText(/What I’d step into first/i)).toBeInTheDocument();
    expect(managerFixture.next).not.toBeNull();
    expect(screen.getByText(managerFixture.next!.text)).toBeInTheDocument();
    expect(screen.getByText('What needs your hands')).toBeInTheDocument();
  });

  it('a clear office says so once — no zero rows', () => {
    renderView(<ManagerDashboard view={managerNewFixture} />);
    expect(screen.getByText(/Nothing is waiting on you\./)).toBeInTheDocument();
  });
});

describe('close the day status', () => {
  it('after close with a saved-but-unsealed record, says so and links there', () => {
    renderView(<ManagerDashboard view={managerClosedFixture} />);
    expect(screen.getAllByText(/Saved, not sealed/).length).toBeGreaterThan(0);
    expect(managerClosedFixture.closeDay?.href).toBe('/deposit-log');
  });

  it('not started while open is calm', () => {
    expect(managerFixture.closeDay?.state).toBe('not_started');
    expect(managerFixture.closeDay?.tone).toBe('calm');
  });
});

describe('staffing stays phase-aware and demoted', () => {
  it('open office: the live roster renders below the queue', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} />);
    const text = container.textContent!;
    expect(text.indexOf('What needs your hands')).toBeLessThan(text.indexOf('Dana R.'));
  });

  it('closed office: calm summary, no manufactured urgency', () => {
    const { container } = renderView(<ManagerDashboard view={managerClosedFixture} />);
    expect(screen.getByText(/No live staffing status is needed\./)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/not in yet/i);
  });
});

describe('brand-new office', () => {
  it('gets setup guidance, not a wall of zeros', () => {
    const { container } = renderView(<ManagerDashboard view={managerNewFixture} />);
    expect(screen.getByText(/No days have been closed out yet\./)).toBeInTheDocument();
    expect(container.textContent).not.toContain('$0');
  });
});
