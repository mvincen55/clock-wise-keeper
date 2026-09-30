/** Owner dashboard: year-to-date context, comparable history, configured goals,
 * owner decisions and honest handling of incomplete or missing records. */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import {
  ownerClosedFixture, ownerFixture, ownerIncompleteFixture, ownerNewFixture, ownerPartialFixture,
} from '@/components/dashboard/fixtures';
import { buildGoalBrief, money } from '@/lib/owner-pulse';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const pressed = (name: string | RegExp) => screen.getByRole('button', { name, pressed: true });
const clickPreset = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

describe('the hierarchy', () => {
  it('leads with performance, historical context and chosen goals before operational detail', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} chartWidth={700} />);
    const text = container.textContent!;
    expect(text.indexOf('How we’re doing')).toBeLessThan(text.indexOf('Active goals'));
    expect(text.indexOf('Active goals')).toBeLessThan(text.indexOf('Needs you'));
    expect(screen.getByRole('region', { name: 'Collections over time' }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Across the years' })).toBeInTheDocument();
  });

  it('the header carries the greeting, the office state, the role context, and the primary actions', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Megan');
    expect(screen.getByRole('link', { name: /Attention · 5/ })).toHaveAttribute('href', '/management');
    expect(screen.getAllByRole('link', { name: /^Close the Day$/ })[0]).toHaveAttribute('href', '/deposit-log');
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(header).getByText('Owner')).toBeInTheDocument();
    expect(within(header).getByText('Dentist')).toBeInTheDocument();
  });

  it('the summary is the office state and genuine priorities — no crowded sentence, no routine lateness', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />);
    expect(ownerFixture.summary.headline).toBe('Open · 4 of 8 in');
    expect(ownerFixture.summary.lines.map(l => l.id)).toEqual(['payroll']);
    expect(screen.getByText('Payroll hours are due Thu · 1 open time record.')).toHaveAttribute('href', '/management/payroll');
    expect(container.textContent).not.toMatch(/came in late|things need you/);
  });

  it('opens on year to date and switches totals and target to this month', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(pressed('Year to date')).toBeInTheDocument();
    clickPreset('This month');
    expect(pressed('This month')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Production' })).getByText('$7,420')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Collections' })).getByText('$6,150')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Collections' })).getAllByText('Partial records').length).toBeGreaterThan(0);
  });

  it('has readable dates, coverage labels, source and exact chart data', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText('View chart data')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /exact dates, amounts, and record coverage/ })).toBeInTheDocument();
    expect(screen.getByText('About this comparison')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Office day \d+\.\d+/);
  });
});

describe('daily financial pulse', () => {
  it('includes a sealed day in this month’s real totals', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />); clickPreset('This month');
    expect(within(screen.getByRole('region', { name: 'Production' })).getByText('$15,570')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Collections' })).getByText('$14,050')).toBeInTheDocument();
  });

  it('a partial record is labeled and never rendered as a fabricated zero', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />); clickPreset('This month');
    expect(screen.getAllByText('Partial records').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('$0');
  });

  it('no configured goal → "No goal set" with the setup action, no fake percentage', () => {
    const { container } = renderView(<OwnerDashboard view={ownerNewFixture} />);
    expect(container.textContent).not.toMatch(/% of the \$/);
    expect(container.textContent).not.toContain('$0');
    expect(screen.getAllByText('No goal set')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Set a production goal/ })).toHaveAttribute('href', '/management/office/settings#office-goals');
    expect(screen.getByText('No comparable history recorded for these dates yet.')).toBeInTheDocument();
  });
});

describe('goal meters', () => {
  it('each metric uses its own configured goal and keeps incomplete pace unjudged', () => {
    renderView(<OwnerDashboard view={ownerFixture} />); clickPreset('This month');
    expect(screen.getByRole('meter', { name: 'Production goal progress' })).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByRole('meter', { name: 'Collections goal progress' })).toHaveAttribute('aria-valuenow', '4');
    expect(screen.getByText('Monthly goal · $160,000')).toBeInTheDocument();
    expect(screen.getByText('Monthly goal · $150,000')).toBeInTheDocument();
    expect(screen.queryByText(/Below expected pace/)).not.toBeInTheDocument();
  });

  it('a complete month shows expected progress and projected finish', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />); clickPreset('This month');
    expect(screen.getAllByText(/On pace · expected by now/)).toHaveLength(2);
    expect(screen.getByText('Projected month finish')).toBeInTheDocument();
  });

  it('a partially recorded month shows recorded totals and the fix without a pace verdict', () => {
    const { container } = renderView(<OwnerDashboard view={ownerPartialFixture} />); clickPreset('This month');
    expect(screen.getAllByText('Partial records').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('link', { name: /Complete the records/ })[0]).toHaveAttribute('href', '/deposit-log');
    expect(container.textContent).not.toMatch(/Below expected pace|Projected month finish/);
  });

  it('new patients are seen counts for the selected period, not scheduled counts', () => {
    renderView(<OwnerDashboard view={ownerFixture} />); clickPreset('This month');
    expect(within(screen.getByRole('region', { name: 'New patients seen' })).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'New patients seen' })).queryByText('3')).not.toBeInTheDocument();
  });
});

describe('worth a look', () => {
  it('names the gap and the change with their comparison, meaning, basis, receipts, and one next step', () => {
    renderView(<OwnerDashboard view={ownerPartialFixture} />);
    const insights = ownerPartialFixture.insights!;
    expect(insights.map(i => i.id)).toEqual(['records_incomplete', 'missed_falling']);
    expect(screen.getByText('2 office days this month have no closeout.')).toBeInTheDocument();
    expect(screen.getByText('Cancellations and no-shows are down on the comparable period.')).toBeInTheDocument();
    expect(screen.getAllByText('Observed')).toHaveLength(2);
    expect(screen.getAllByText('Why?')).toHaveLength(2);
    for (const receipt of insights[0].receipts) {
      expect(screen.getAllByText(receipt.value).length).toBeGreaterThan(0);
      expect(screen.getAllByText(receipt.source).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole('link', { name: /Complete the records/ }).length).toBeGreaterThan(0);
  });

  it('never repeats the meters: a month on pace has nothing to note', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(ownerClosedFixture.insights).toEqual([]);
    expect(screen.getByText(/Nothing else to note from the recorded days/)).toBeInTheDocument();
  });

  it('a brand-new office gets a data observation, not a verdict', () => {
    renderView(<OwnerDashboard view={ownerNewFixture} />);
    expect(screen.getByText('No office days have been closed out yet.')).toBeInTheDocument();
    const doors = screen.getAllByRole('link', { name: /Close out a day/ });
    expect(doors.length).toBeGreaterThanOrEqual(1);
    for (const door of doors) expect(door).toHaveAttribute('href', '/deposit-log');
  });
});

describe('incomplete history', () => {
  it('lets the owner explicitly choose imported history with its own metric names', () => {
    renderView(<OwnerDashboard view={ownerIncompleteFixture} />);
    expect(pressed('Year to date')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Financial data source' }), { target: { value: 'report_history' } });
    expect(screen.getByRole('button', { name: 'Posted charges' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receipts' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Production' })).not.toBeInTheDocument();
  });
});

describe('office challenge', () => {
  it('shows one primary goal once, with the rest as a compact count', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getAllByText('Morning huddle on time')).toHaveLength(1);
    expect(screen.getByText(/1 more active/)).toBeInTheDocument();
    expect(screen.getByText('On track')).toBeInTheDocument();
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
    clickPreset('This month');
    expect(within(screen.getByRole('region', { name: 'Production' })).getByText('$15,570')).toBeInTheDocument();
  });

  it('lists every Attention item in consequence order with its date, its next step, why it is mine, and one navigation action', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(ownerFixture.needs.now.map(i => i.key)).toEqual(['record_signoff:r1', 'pto_request:p1', 'content_review:v4', 'incident_countersign:i2', 'challenge_verify:g2']);
    const first = document.querySelector('[data-item-key="record_signoff:r1"]') as HTMLElement;
    expect(within(first).getByText('Priya S. · Record awaiting your sign-off · attendance').closest('a')).toHaveAttribute('href', '/management?item=record_signoff:r1');
    expect(within(first).getByText('payroll Thu · 2d')).toBeInTheDocument();
    expect(within(first).getByText('Sign off')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: /^Open/ })).toHaveAttribute('href', '/management?item=record_signoff:r1');
    fireEvent.click(within(first).getByRole('button', { name: /Why it’s yours/ }));
    expect(within(first).getByText(/An escalation policy opened this record/)).toBeInTheDocument();
    expect(screen.getByText('Sterilization log · version 4 in review').closest('a')).toHaveAttribute('href', '/management?item=content_review:v4');
    // The header count is the unique items that need the owner — the same as the badge.
    const panel = screen.getByRole('region', { name: 'Needs you' });
    expect(within(panel).getByText('5')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /Open Attention/ })).toHaveAttribute('href', '/management');
  });
});

describe('one number, one home', () => {
  it('keeps the current total and goal in one card; the historical summary is identified', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />); clickPreset('This month');
    const card = screen.getByRole('region', { name: 'Collections' });
    expect(within(card).getAllByText('$14,050')).toHaveLength(1);
    expect(within(card).getByRole('meter')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Goals this month' })).not.toBeInTheDocument();
  });
});

describe('office states', () => {
  it('open office: the roster lives on the board, once, and routine lateness is calm there', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.queryByText('Staffing today')).not.toBeInTheDocument();
    const board = screen.getByRole('list', { name: 'Who is where' });
    expect(within(board).getByText('In · late 12m')).toHaveClass('text-muted-foreground');
    expect(screen.getAllByText('Marcus T.')).toHaveLength(1);
    // Today keeps the exceptions and the count line only.
    const today = screen.getByRole('region', { name: 'Team today' });
    expect(within(today).getAllByRole('list', { name: 'Who is where' })).toHaveLength(1);
    expect(within(today).getAllByText('Ken W.').length).toBeGreaterThan(0);
  });

  it('closed day: most recent business day labeled, no manufactured urgency', () => {
    const { container } = renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getAllByText(/Closed for the day/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/not in yet/i);
    expect(ownerClosedFixture.summary.lines).toEqual([]);
    expect(screen.getByText('No owner decisions are waiting.')).toBeInTheDocument();
  });
});

describe('tools', () => {
  it('one organized area: the assigned role first, management next, everyone on request, no destination twice', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const tools = screen.getByRole('region', { name: 'Tools' });
    const text = tools.textContent!;
    expect(text.indexOf('Dentist')).toBeLessThan(text.indexOf('Management'));
    expect(within(tools).queryByRole('link', { name: /Timesheet/ })).not.toBeInTheDocument();
    fireEvent.click(within(tools).getByRole('button', { name: /More tools/ }));
    expect(within(tools).getByRole('link', { name: /Timesheet/ })).toHaveAttribute('href', '/timesheet');
    const hrefs = within(tools).getAllByRole('link').map(a => a.getAttribute('href'));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('the owner’s own items sit under Mine, apart from the office’s queue', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const mine = screen.getByRole('region', { name: 'Mine' });
    expect(within(mine).getByText('Read and sign · Radiation safety policy')).toBeInTheDocument();
    for (const a of within(mine).getAllByRole('link', { name: /Read and sign/ })) expect(a).toHaveAttribute('href', '/management/office/acknowledgments?assignment=ack-o1');
    expect(money(ownerFixture.performance!.thisMonth.productionCents)).toBe('$7,420');
  });
});
