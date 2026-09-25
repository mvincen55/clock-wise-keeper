/**
 * Owner Home composition — the performance-first surface.
 *
 * These tests render OwnerDashboard against fixtures that run through the
 * REAL derivation layer (owner-pulse.ts, performance-series.ts,
 * goal-progress.ts, home-insights.ts), and pin the acceptance rules:
 *
 *  - the opening screen holds the briefing sentence, the period strip, and
 *    a substantial chart, with the goal meters and observations beside it;
 *  - a closed-out day shows its actual production and collections;
 *  - a missing closeout is narrated, never rendered as $0;
 *  - production and collections each read against ONLY their own goal, by
 *    calendar-day pace, and an unset goal reads "No goal set";
 *  - observations carry the comparison, the period, receipts, a next step;
 *  - Needs you is the same top-three Attention list Manager Home shows;
 *  - the challenge appears once; nothing management-only leaks.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import {
  ownerClosedFixture, ownerFixture, ownerIncompleteFixture, ownerNewFixture,
} from '@/components/dashboard/fixtures';
import { buildGoalBrief } from '@/lib/owner-pulse';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const pressed = (name: string | RegExp) => screen.getByRole('button', { name, pressed: true });
const clickPreset = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('the opening screen', () => {
  it('puts the sentence, the strip, and the chart before anything else', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} chartWidth={800} />);
    const text = container.textContent!;
    expect(text.indexOf('Today’s office pulse')).toBeLessThan(text.indexOf('Production'));
    expect(screen.getByRole('list', { name: 'Performance strip' }).querySelectorAll('[role="listitem"]')).toHaveLength(4);
    expect(screen.getByTestId('performance-chart-frame').querySelector('svg')).not.toBeNull();
    expect(text.indexOf('Production and Collections')).toBeLessThan(text.indexOf('Needs you'));
  });

  it('keeps the masthead compact and puts the frequent tools beside it', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const tools = screen.getByRole('navigation', { name: 'Quick tools' });
    expect(within(tools).getByRole('link', { name: /Create FOF/ })).toHaveAttribute('href', '/fof');
    expect(within(tools).getByRole('link', { name: /Fee schedules/ })).toHaveAttribute('href', '/fof/fees');
    expect(within(tools).getByRole('link', { name: /Close the Day/ })).toHaveAttribute('href', '/deposit-log');
    expect(within(tools).getByRole('link', { name: /Report history/ })).toHaveAttribute('href', '/report-history');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Megan');
  });

  it('opens on the last three months when this month is still thin, and the reader can switch', () => {
    renderView(<OwnerDashboard view={ownerFixture} chartWidth={800} />);
    expect(pressed('Last 3 months')).toBeInTheDocument();
    clickPreset('This month');
    expect(pressed('This month')).toBeInTheDocument();
    // The strip follows the period: the one closed-out day of March.
    expect(screen.getByRole('listitem', { name: /^Production, Mar 1 – Mar 3, 2026 · partial: \$7,420/ })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /^Collections, .*\$6,150/ })).toBeInTheDocument();
    expect(screen.getAllByText('1 of 3 days recorded').length).toBeGreaterThanOrEqual(2);
  });
});

describe('daily financial pulse', () => {
  it('a closed-out day shows its actual production and collections', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getByText("Today's closeout")).toBeInTheDocument();
    expect(screen.getByText('$8,150')).toBeInTheDocument(); // production
    expect(screen.getByText('$7,900')).toBeInTheDocument(); // collected
    expect(ownerClosedFixture.summary).toContain('$8,150');
  });

  it('a missing closeout is narrated with the last closed day — never $0', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} chartWidth={800} />);
    expect(screen.getByText("Yesterday's closeout")).toBeInTheDocument();
    expect(screen.getByText(/figures appear after the day is closed out/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain('$0');
  });

  it('no configured goal → "No goal set" with the setup action, no fake percentage', () => {
    const { container } = renderView(<OwnerDashboard view={ownerNewFixture} />);
    expect(container.textContent).not.toMatch(/% of the \$/);
    expect(container.textContent).not.toContain('$0');
    expect(screen.getAllByText('No goal set')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Set a production goal/ })).toHaveAttribute('href', '/management/office/settings#office-goals');
    expect(screen.getByText(/No days have been closed out yet\./)).toBeInTheDocument();
    expect(screen.getByText('Nothing recorded for this period.')).toBeInTheDocument();
  });
});

describe('goal meters', () => {
  it('production and collections each read against their own goal, by calendar-day pace', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const production = screen.getByRole('meter', { name: /Production 5% of the \$160,000 goal/ });
    expect(production).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByRole('meter', { name: /Collections 4% of the \$150,000 goal/ })).toBeInTheDocument();
    expect(screen.getByText('5% of the $160,000 goal · $8,064 behind calendar pace with day 3 of 31.')).toBeInTheDocument();
    expect(screen.getByText('4% of the $150,000 goal · $8,366 behind calendar pace with day 3 of 31.')).toBeInTheDocument();
    expect(screen.getAllByText('Behind calendar pace')).toHaveLength(2);
    expect(screen.getByText(/Calendar-day pace: the goal spread evenly/)).toBeInTheDocument();
  });

  it('a month on pace reads as on pace, with the expected figure', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getAllByText('On calendar pace')).toHaveLength(2);
    expect(screen.getByText('Expected by now $15,484')).toBeInTheDocument();
  });
});

describe("what I'm noticing", () => {
  it('names what changed, the comparison and period, a reason without a cause, receipts, and one next step', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const insights = ownerFixture.insights!;
    expect(insights.map(i => i.id)).toEqual(['production_behind', 'collections_behind']);
    expect(screen.getByText('Production is behind calendar pace for March.')).toBeInTheDocument();
    expect(screen.getByText('Collections are behind calendar pace for March.')).toBeInTheDocument();
    expect(screen.getByText('$7,420 of the $160,000 goal (5%) with 10% of the month elapsed — $8,064 under the $15,484 expected by now.')).toBeInTheDocument();
    expect(screen.getAllByText(/Worth a look, not a verdict/)).toHaveLength(2);
    expect(screen.getAllByText('Why?')).toHaveLength(2);
    for (const receipt of insights[0].receipts) {
      expect(screen.getAllByText(receipt.value).length).toBeGreaterThan(0);
      expect(screen.getAllByText(receipt.source).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole('link', { name: /Open Close the Day/ })[0]).toHaveAttribute('href', '/deposit-log');
    expect(screen.getByText(/Fixed rules over recorded days .* Not a prediction\./)).toBeInTheDocument();
  });

  it('a steady month is said as good news, with the checks that passed', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(ownerClosedFixture.insights![0].id).toBe('steady');
    expect(screen.getByText('March is on pace for production and collections.')).toBeInTheDocument();
  });

  it('a brand-new office gets a data observation, not a verdict', () => {
    renderView(<OwnerDashboard view={ownerNewFixture} />);
    expect(screen.getByText('No office days have been closed out yet.')).toBeInTheDocument();
    // The chart's empty state and the observation both open the same door.
    const doors = screen.getAllByRole('link', { name: /Close out a day/ });
    expect(doors.length).toBeGreaterThanOrEqual(1);
    for (const door of doors) expect(door).toHaveAttribute('href', '/deposit-log');
  });
});

describe('incomplete history', () => {
  it('shows closeouts with their gaps and offers report history as a separate view, never blended', () => {
    renderView(<OwnerDashboard view={ownerIncompleteFixture} chartWidth={800} />);
    expect(pressed('Last 3 months')).toBeInTheDocument();
    const source = screen.getByRole('group', { name: 'Source' });
    expect(within(source).getByRole('button', { name: 'Close the Day', pressed: true })).toBeInTheDocument();
    fireEvent.click(within(source).getByRole('button', { name: 'Report history' }));
    expect(screen.getByRole('button', { name: /Posted charges/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Receipts/ })).toBeInTheDocument();
    expect(screen.getByText(/Report history · posting date \(report package\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open report history/ })).toHaveAttribute('href', '/report-history?start=2026-01-01&end=2026-03-03&tab=daily');
    // Production never appears under the report view's name.
    expect(screen.queryByRole('button', { name: /^Production/ })).not.toBeInTheDocument();
  });
});

describe('office challenge', () => {
  it('shows one primary goal once, with the rest as a compact count', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getAllByText('Morning huddle on time')).toHaveLength(1);
    expect(screen.getByText(/1 more active/)).toBeInTheDocument();
    expect(screen.getByText(/On track/)).toBeInTheDocument();
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

describe('needs you', () => {
  it('zero decisions is one calm line — the day is still judged by the pulse', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getByText(/No owner decisions are waiting\./)).toBeInTheDocument();
    expect(screen.getByText('$8,150')).toBeInTheDocument();
  });

  it('shows the first three Attention items in consequence order, each opening its exact item', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(ownerFixture.needs.top.map(i => i.key)).toEqual(['record_signoff:r1', 'pto_request:p1', 'content_review:v4']);
    expect(screen.getByText('Priya S. · Record awaiting your sign-off · attendance').closest('a'))
      .toHaveAttribute('href', '/management?item=record_signoff:r1');
    expect(screen.getByText('Sterilization log · version 4 in review').closest('a'))
      .toHaveAttribute('href', '/management?item=content_review:v4');
    expect(screen.getByText('payroll Thu · 2d')).toBeInTheDocument();
    expect(screen.getByText('2 more need you now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Attention$/ })).toHaveAttribute('href', '/management');
    expect(screen.getByText('5 now')).toBeInTheDocument();
  });
});

describe('one number, one home', () => {
  it('the month figure lives in the strip and the meter; observations only cite it as evidence', () => {
    const { container } = renderView(<OwnerDashboard view={ownerClosedFixture} chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    // Evidence is not a home: drop the receipts and the observation list.
    container.querySelectorAll('details, ul').forEach(el => el.remove());
    const collected = container.textContent!.match(/\$14,050/g) ?? [];
    expect(collected).toHaveLength(2); // the period tile and the goal meter
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
    expect(ownerClosedFixture.summary).toMatch(/Today was/);
    expect(screen.getByText(ownerClosedFixture.summary!)).toBeInTheDocument();
  });
});
