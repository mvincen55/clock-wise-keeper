/**
 * The performance block as rendered: the period row scopes the strip and
 * the chart; series are individually selectable and keep their color; a
 * table twin carries every value with a link to the record behind it;
 * drilldowns land on destinations that read the parameters; the baseline
 * tick never reads as money; report history stays a separate labeled view.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PerformanceSection } from '@/components/dashboard/performance/PerformanceSection';
import { drilldownFor, periodDrilldown } from '@/components/dashboard/performance/PerformanceChart';
import { MissedTrend, missedHref } from '@/components/dashboard/performance/MissedTrend';
import { compactDollars } from '@/components/dashboard/performance/chart-theme';
import { ownerFixture, ownerIncompleteFixture } from '@/components/dashboard/fixtures';
import { periodFor } from '@/lib/performance-series';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const data = ownerFixture.performance!;

describe('period and series controls', () => {
  it('the period row scopes the strip and the chart together', () => {
    renderView(<PerformanceSection data={data} state="ok" chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'Last month' }));
    expect(screen.getByRole('button', { name: 'Last month', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /^Production, Feb 1 – Feb 28, 2026:/ })).toBeInTheDocument();
    expect(screen.getAllByText('Feb 1 – Feb 28, 2026').length).toBeGreaterThanOrEqual(2); // the strip and the chart header agree
    expect(screen.getByText(/Close the Day · office day \(deposit date\) · \d+ of 28 days recorded/)).toBeInTheDocument();
  });

  it('each series is a real switch; the last visible one cannot be switched off', () => {
    renderView(<PerformanceSection data={data} state="ok" chartWidth={800} />);
    const frame = screen.getByTestId('performance-chart-frame');
    expect(frame.querySelectorAll('.recharts-bar')).toHaveLength(2);
    const collections = screen.getByRole('button', { name: /^Collections/ });
    fireEvent.click(collections);
    expect(collections).toHaveAttribute('aria-pressed', 'false');
    expect(frame.querySelectorAll('.recharts-bar')).toHaveLength(1);
    // Production is now the only series shown; it stays on.
    fireEvent.click(screen.getByRole('button', { name: /^Production/ }));
    expect(screen.getByRole('button', { name: /^Production/ })).toHaveAttribute('aria-pressed', 'true');
    expect(frame.querySelectorAll('.recharts-bar')).toHaveLength(1);
  });

  it('cumulative view steps over recorded days and says what a flat step means', () => {
    renderView(<PerformanceSection data={data} state="ok" chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cumulative' }));
    expect(screen.getByRole('button', { name: 'Cumulative', pressed: true })).toBeInTheDocument();
    expect(screen.getByTestId('performance-chart-frame').querySelectorAll('.recharts-line')).toHaveLength(2);
    expect(screen.getByText(/a flat step is an unrecorded day/)).toBeInTheDocument();
  });
});

describe('every value without hovering', () => {
  it('the table twin lists each day with its status and a link to the closeout', () => {
    renderView(<PerformanceSection data={data} state="ok" chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Values as a table' }));
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('2026-03-01')).toBeInTheDocument();
    expect(within(rows[1]).getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(within(rows[2]).getByText('$7,420.00')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Saved, not sealed')).toBeInTheDocument();
    expect(within(rows[2]).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/deposit-log?date=2026-03-02');
    expect(within(rows[3]).getByText(/2026-03-03 · partial/)).toBeInTheDocument();
    expect(within(table).getByText('Period total')).toBeInTheDocument();
  });

  it('the baseline tick is never rendered as money', () => {
    expect(compactDollars(0)).toBe('0');
    expect(compactDollars(742_000)).toBe('$7.4k');
    expect(compactDollars(12_345_678)).toBe('$123k');
    expect(compactDollars(150_000_000)).toBe('$1.5M');
  });
});

describe('drilldowns', () => {
  it('a closeout day opens Close the Day on that date; a week opens the table; report days open report history with the range', () => {
    expect(drilldownFor({ start: '2026-03-02', end: '2026-03-02', days: 1 }, 'closeouts', 'admin')).toBe('/deposit-log?date=2026-03-02');
    expect(drilldownFor({ start: '2026-03-02', end: '2026-03-08', days: 7 }, 'closeouts', 'admin')).toBeNull();
    expect(drilldownFor({ start: '2026-01-05', end: '2026-01-11', days: 7 }, 'report_history', 'admin')).toBe('/report-history?start=2026-01-05&end=2026-01-11&tab=daily');
    expect(drilldownFor({ start: '2026-01-05', end: '2026-01-05', days: 1 }, 'report_history', 'member')).toBeNull();
    expect(periodDrilldown('report_history', { start: '2026-01-01', end: '2026-03-03' }, 'admin')).toBe('/report-history?start=2026-01-01&end=2026-03-03&tab=daily');
    expect(periodDrilldown('closeouts', { start: '2026-01-01', end: '2026-03-03' }, 'admin')).toBeNull();
  });

  it('the missed-appointment tile and trend hand the period to Missed appointments', () => {
    renderView(<PerformanceSection data={data} state="ok" chartWidth={800} supporting={(period, d) => <MissedTrend period={period} data={d} width={700} />} />);
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(screen.getByRole('listitem', { name: /^Missed appointments/ }).querySelector('a')).toHaveAttribute('href', '/management/missed-appointments?start=2026-03-01&end=2026-03-03');
    expect(missedHref({ start: '2026-03-01', end: '2026-03-03' })).toBe('/management/missed-appointments?start=2026-03-01&end=2026-03-03');
    expect(screen.getByRole('link', { name: 'Missed appointments' })).toHaveAttribute('href', '/management/missed-appointments?start=2026-03-01&end=2026-03-03');
    fireEvent.click(screen.getByRole('button', { name: 'By department' }));
    expect(screen.getByText('Doctor')).toBeInTheDocument();
    expect(screen.getByText('Hygiene')).toBeInTheDocument();
  });
});

describe('sources', () => {
  it('report history is a separate labeled view with its own definitions, never a blended total', () => {
    const d = ownerIncompleteFixture.performance!;
    renderView(<PerformanceSection data={d} state="ok" chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'Last 3 months' }));
    const source = screen.getByRole('group', { name: 'Source' });
    fireEvent.click(within(source).getByRole('button', { name: 'Report history' }));
    expect(screen.getByRole('listitem', { name: /^Posted charges, Jan 1 – Mar 3, 2026 · partial/ })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /^Receipts, / })).toBeInTheDocument();
    expect(screen.getByText(/Report history · posting date \(report package\) · \d+ of 62 posting days recorded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Values as a table' }));
    expect(screen.getByText(/Receipts can pay older balances; this is not a collection rate/)).toBeInTheDocument();
    // Switching back restores the closeout definitions and the production name.
    fireEvent.click(within(source).getByRole('button', { name: 'Close the Day' }));
    expect(screen.getByRole('listitem', { name: /^Production, / })).toBeInTheDocument();
  });

  it('loading holds the frame without zeros; a failed read says so', () => {
    const { container, rerender } = renderView(<PerformanceSection data={null} state="loading" />);
    expect(container.textContent).toMatch(/Reading/);
    expect(container.textContent).not.toContain('$');
    rerender(<MemoryRouter><PerformanceSection data={data} state="error" chartWidth={800} /></MemoryRouter>);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });

  it('a member never sees the source switch even when the fixture holds report rows', () => {
    const memberData = { ...ownerIncompleteFixture.performance!, access: 'member' as const };
    renderView(<PerformanceSection data={memberData} state="ok" chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'Last 3 months' }));
    expect(screen.queryByRole('group', { name: 'Source' })).not.toBeInTheDocument();
  });
});

describe('periods on the chart', () => {
  it('a partial month is labeled partial, and this week starts on Monday', () => {
    renderView(<PerformanceSection data={data} state="ok" chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'This week' }));
    expect(periodFor('this_week', data.today).start).toBe('2026-03-02');
    expect(screen.getByRole('listitem', { name: /^Production, Mar 2 – Mar 3, 2026 · partial/ })).toBeInTheDocument();
    expect(screen.getByText(/this week is partial/)).toBeInTheDocument();
  });
});
