/**
 * Owner Home composition — the redesigned "Today's Office Pulse" surface.
 *
 * These tests render OwnerDashboard against fixtures that run through the
 * REAL derivation layer (owner-pulse.ts), and pin the acceptance rules:
 *
 *  - a closed-out day shows its actual production and collections;
 *  - a missing closeout is narrated, never rendered as $0;
 *  - pace math appears only when a collections goal is configured;
 *  - missed appointments carry their hygiene/doctor breakdown;
 *  - zero owner decisions never claims the whole office is healthy;
 *  - the recommendation's "Why?" receipts match its computed inputs;
 *  - each number keeps one home — no goal or figure renders twice.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import {
  ownerClosedFixture, ownerFixture, ownerNewFixture,
} from '@/components/dashboard/fixtures';
import { buildGoalBrief } from '@/lib/owner-pulse';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('daily financial pulse', () => {
  it('a closed-out day shows its actual production and collections', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getByText("Today's closeout")).toBeInTheDocument();
    expect(screen.getByText('$8,150')).toBeInTheDocument(); // production
    expect(screen.getByText('$7,900')).toBeInTheDocument(); // collected
  });

  it('a missing closeout is narrated with the last closed day — never $0', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText("Yesterday's closeout")).toBeInTheDocument();
    expect(screen.getByText(/figures appear after the day is closed out/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain('$0');
  });

  it('paced collections status renders from the configured goal', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    // $9,000 of the $150,000 goal, behind the paced target.
    expect(screen.getByText(/6% of the \$150,000 goal · \$5,516 behind pace/)).toBeInTheDocument();
  });

  it('no configured goal → no fake percentage-to-goal anywhere', () => {
    const { container } = renderView(<OwnerDashboard view={ownerNewFixture} />);
    expect(container.textContent).not.toMatch(/% of the \$/);
    expect(container.textContent).not.toContain('$0');
    expect(screen.getByText(/No days have been closed out yet\./)).toBeInTheDocument();
  });
});

describe('missed appointments', () => {
  it('today distinguishes hygiene and doctor cancellations and no-shows', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText('2 hygiene cancellations · 1 doctor no-show')).toBeInTheDocument();
  });

  it('month-to-date is its own number with its own home', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText(/Missed appointments this month/i)).toBeInTheDocument();
    expect(screen.getByText('3 hygiene cancellations · 1 doctor no-show')).toBeInTheDocument();
  });

  it('a clean day reads calm, not alarming', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getByText(/None recorded — clean schedule day/)).toBeInTheDocument();
  });

  it('no trend claim renders without enough comparison data', () => {
    // ownerFixture has only 2 closed-out days this month — below the minimum.
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />);
    expect(container.textContent).not.toMatch(/above recent pace|Improving vs last month/i);
  });
});

describe('office goal', () => {
  it('shows one primary goal once, with the rest as a compact count', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getAllByText('Morning huddle on time')).toHaveLength(1);
    expect(screen.getByText(/1 more active/)).toBeInTheDocument();
    expect(screen.getByText(/On track/)).toBeInTheDocument();
    // The state is math with receipts, not a vibe.
    expect(screen.getByText(/90% done · 67% of the window elapsed/)).toBeInTheDocument();
  });

  it('renders the pending-verification state', () => {
    const goal = buildGoalBrief(
      [{
        id: 'g9', title: 'Recall reactivation', metric: 'patients',
        progress: 10, target_count: 10, starts_on: '2026-02-24', ends_on: '2026-03-02',
        status: 'pending_verification',
      }],
      '2026-03-03',
    );
    renderView(<OwnerDashboard view={{ ...ownerFixture, goal }} />);
    expect(screen.getByText('Awaiting verification')).toBeInTheDocument();
  });

  it('no active goal offers the Sprint Builder path', () => {
    renderView(<OwnerDashboard view={ownerNewFixture} />);
    expect(screen.getByText(/No office goal is running\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Choose a goal/ })).toHaveAttribute('href', '/goals');
  });
});

describe('owner attention', () => {
  it('zero decisions is one calm line — the day is still judged by the pulse', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getByText(/No owner decisions are waiting\./)).toBeInTheDocument();
    // The pulse still leads with real figures, so "clear" never means "good day".
    expect(screen.getByText('$8,150')).toBeInTheDocument();
  });

  it('decisions route to their existing surfaces', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText('Approvals pending').closest('a')).toHaveAttribute('href', '/approvals');
    expect(
      screen.getByText('Accountability records at owner review').closest('a'),
    ).toHaveAttribute('href', '/management');
  });
});

describe("what I'd look at", () => {
  it('renders one recommendation whose receipts match the computed inputs', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const rec = ownerFixture.lookAt!;
    expect(rec.id).toBe('collections_posting'); // deterministic from fixture inputs
    expect(screen.getByText(rec.text)).toBeInTheDocument();
    expect(screen.getByText(/Why\?/)).toBeInTheDocument();
    for (const receipt of rec.receipts) {
      // A receipt value may legitimately also be a pulse figure elsewhere.
      expect(screen.getAllByText(receipt.value).length).toBeGreaterThan(0);
      expect(screen.getByText(receipt.source)).toBeInTheDocument();
    }
  });

  it('a healthy day says no intervention is suggested', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(ownerClosedFixture.lookAt!.id).toBe('all_clear');
    expect(screen.getByText(/No intervention suggested/)).toBeInTheDocument();
  });
});

describe('one number, one home', () => {
  it('no repeated goal titles, decision counts, or collections totals', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getAllByText('Morning huddle on time')).toHaveLength(1);
    // The second goal collapses into the "1 more active" count — never a list.
    expect(screen.queryAllByText('Same-day treatment acceptance').length).toBeLessThanOrEqual(1);
    // Month-to-date collected renders exactly once as a figure (pulse hero).
    // Receipts inside the collapsed "Why?" disclosure are evidence, not a
    // second figure home — exclude them before counting.
    container.querySelectorAll('details').forEach((d) => d.remove());
    const collected = container.textContent!.match(/\$9,000/g) ?? [];
    expect(collected).toHaveLength(1);
  });
});

describe('office states', () => {
  it('open office: live staffing question stays available, quietly', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText('Staffing today')).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
  });

  it('closed day: most recent business day labeled, no manufactured urgency', () => {
    const { container } = renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getAllByText(/Closed for the day/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/not in yet/i);
  });

  it('summary sentence exists and is built from recorded facts', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    // Deterministic sentence narrating the closed-out day's real numbers.
    expect(ownerClosedFixture.summary).toMatch(/Today was/);
    expect(ownerClosedFixture.summary).toContain('$8,150');
    expect(screen.getByText(ownerClosedFixture.summary!)).toBeInTheDocument();
  });
});
