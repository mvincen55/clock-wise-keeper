/**
 * Team Member Home composition — the rebuilt member surface.
 *
 *  - the page leads with "My next move", never with clock status or hours;
 *  - Our Office Pulse shows real values from the canonical layer when the
 *    office chose "everyone", and omits a hidden metric with no teaser;
 *  - role emphasis follows the OPERATIONAL role (front desk gets the
 *    new-patient pipeline; others don't get front-desk emphasis);
 *  - no rankings, no individual attribution, no personal-hours chart;
 *  - timekeeping and PTO live in a small utility band at the bottom.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import {
  assistantFixture, frontDeskFixture, hygienistFixture, memberClearFixture,
  memberHiddenFinancialsFixture, memberNewFixture,
} from '@/components/dashboard/fixtures';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('my next move leads', () => {
  it('the next action renders before any time or PTO content', () => {
    const { container } = renderView(<MemberDashboard view={frontDeskFixture} />);
    const text = container.textContent!;
    expect(text.indexOf('My next move')).toBeLessThan(text.indexOf('My time & PTO'));
    expect(screen.getByText('Answer an office request')).toBeInTheDocument();
  });

  it('nothing assigned reads as a genuine all-clear, not a zero wall', () => {
    renderView(<MemberDashboard view={memberClearFixture} />);
    expect(screen.getByText(/You’re clear\. Nothing is assigned to you right now\./)).toBeInTheDocument();
  });
});

describe('our office pulse', () => {
  it('shows real dollar values when visibility is "everyone"', () => {
    renderView(<MemberDashboard view={hygienistFixture} />);
    expect(screen.getByText('Our office pulse')).toBeInTheDocument();
    // Actual values from the canonical layer, not vague percentages.
    expect(screen.getByText('$13,900')).toBeInTheDocument(); // production MTD
    expect(screen.getByText('$9,000')).toBeInTheDocument(); // collections MTD
  });

  it('states the honest time semantics for financial figures', () => {
    renderView(<MemberDashboard view={hygienistFixture} />);
    expect(
      screen.getByText(/Financial figures update after Close the Day — they are not live/),
    ).toBeInTheDocument();
  });

  it('admin-only metrics are omitted cleanly — no teaser, no lock', () => {
    const { container } = renderView(<MemberDashboard view={memberHiddenFinancialsFixture} />);
    expect(container.textContent).not.toContain('Production month to date');
    expect(container.textContent).not.toContain('Collections month to date');
    // The metric whose own setting is 'everyone' remains.
    expect(screen.getByText('New patients seen month to date')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/hidden|locked|admins only/i);
  });

  it('frames the pulse as shared, never individual', () => {
    renderView(<MemberDashboard view={hygienistFixture} />);
    expect(screen.getByText(/shared scoreboard, never an individual one/)).toBeInTheDocument();
  });
});

describe('role-relevant emphasis', () => {
  it('front desk gets the new-patient pipeline', () => {
    renderView(<MemberDashboard view={frontDeskFixture} />);
    expect(screen.getByText('New patients scheduled')).toBeInTheDocument();
    // Mid-morning, today's closeout not in yet: the pipeline shows the week
    // count rather than pretending to know today live.
    expect(screen.getByText('5 this week')).toBeInTheDocument();
  });

  it('a hygienist gets hygiene-side disruption, not front-desk emphasis', () => {
    const { container } = renderView(<MemberDashboard view={hygienistFixture} />);
    expect(screen.getByText(/Hygiene cancellations \+ no-shows this month/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('this week · the pipeline');
    expect(container.textContent).not.toContain('New patients scheduled');
  });

  it('a dental assistant gets no financial role emphasis at all', () => {
    expect(assistantFixture.rolePulse).toHaveLength(0);
  });
});

describe('timekeeping stays a utility', () => {
  it('no seven-day personal-hours chart renders on Home', () => {
    const { container } = renderView(<MemberDashboard view={hygienistFixture} />);
    expect(container.textContent).not.toMatch(/My recorded time, last 7 days/);
    expect(container.querySelector('svg.trend-chart')).toBeNull();
  });

  it('recorded time, PTO, and timesheet links live in the utility band', () => {
    renderView(<MemberDashboard view={hygienistFixture} />);
    expect(screen.getByText('My time & PTO')).toBeInTheDocument();
    expect(screen.getByText('PTO balance')).toBeInTheDocument();
    expect(screen.getAllByText('Timesheet').length).toBeGreaterThan(0);
  });

  it('no streak figure and no rankings anywhere', () => {
    const { container } = renderView(<MemberDashboard view={hygienistFixture} />);
    expect(container.textContent).not.toMatch(/streak|leaderboard|rank/i);
  });
});

describe('brand-new member in a brand-new office', () => {
  it('renders quiet real-zero utilities and no office pulse zeros', () => {
    const { container } = renderView(<MemberDashboard view={memberNewFixture} />);
    expect(container.textContent).not.toContain('$0');
    expect(screen.queryByText('Our office pulse')).not.toBeInTheDocument();
    expect(screen.getByText('Not clocked in')).toBeInTheDocument();
  });
});

describe('deep links', () => {
  it('every pulse and work row points at a real surface', () => {
    renderView(<MemberDashboard view={frontDeskFixture} />);
    const hrefs = [
      ...frontDeskFixture.mine.map(s => s.href),
      ...frontDeskFixture.rolePulse.map(r => r.href),
      ...frontDeskFixture.utilities.map(u => u.href),
    ].filter(Boolean) as string[];
    for (const href of hrefs) {
      expect(href).toMatch(/^\//);
    }
  });
});
