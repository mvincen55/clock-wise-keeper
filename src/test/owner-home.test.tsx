/**
 * Owner Home composition — the redesigned surface.
 *
 * These tests render OwnerDashboard against fixtures that run through the
 * REAL derivation layer (home-brief.ts, attention/, performance-series.ts,
 * goal-progress.ts, home-insights.ts, my-work.ts), and pin the rules:
 *
 *  - the hierarchy is what needs me → status → performance → trends → tools;
 *  - the summary is short: the office state and genuine priorities only;
 *  - Needs you is the same Attention list, with the date, why, next action;
 *  - a closed-out day shows its actual production and collections;
 *  - a missing closeout is narrated, never rendered as $0;
 *  - production and collections each read against ONLY their own goal, on
 *    the office-day basis; a partial month is labeled, never "behind";
 *  - observations never repeat a meter; the challenge appears once;
 *  - the tools area puts the assigned role first and reveals the rest.
 */
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
  it('what needs me, then status, then performance, then trends, then tools', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} chartWidth={800} />);
    const text = container.textContent!;
    const at = (s: string) => { const i = text.indexOf(s); expect(i, s).toBeGreaterThanOrEqual(0); return i; };
    expect(at('Right now')).toBeLessThan(at('Needs you'));
    expect(at('Needs you')).toBeLessThan(at('Production and Collections'));
    expect(at('Production and Collections')).toBeLessThan(at('Cancellations and no-shows'));
    expect(at('Cancellations and no-shows')).toBeLessThan(at('Tools'));
    expect(screen.getByRole('list', { name: 'Performance strip' }).querySelectorAll('[role="listitem"]')).toHaveLength(4);
    expect(screen.getByTestId('performance-chart-frame').querySelector('svg')).not.toBeNull();
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

  it('opens on the last three months when this month is still thin, and the reader can switch', () => {
    renderView(<OwnerDashboard view={ownerFixture} chartWidth={800} />);
    expect(pressed('Last 3 months')).toBeInTheDocument();
    clickPreset('This month');
    expect(pressed('This month')).toBeInTheDocument();
    // The strip follows the period: the one closed-out day of March.
    expect(screen.getByRole('listitem', { name: /^Production, Mar 1 – Mar 3, 2026 · partial: \$7,420/ })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /^Collections, .*\$6,150/ })).toBeInTheDocument();
    expect(screen.getByText(/1 of 1 office day recorded · through Mar 2 · 1 not sealed/)).toBeInTheDocument();
  });

  it('every strip tile carries an information control with the range, cutoff, source, and completeness', () => {
    renderView(<OwnerDashboard view={ownerFixture} chartWidth={800} />);
    const info = screen.getAllByRole('button', { name: /^About / });
    expect(info.length).toBeGreaterThanOrEqual(4);
    fireEvent.click(screen.getByRole('button', { name: 'About production' }));
    const popover = screen.getByRole('dialog');
    expect(within(popover).getByText('Completeness')).toBeInTheDocument();
    expect(within(popover).getByText(/office days recorded through/)).toBeInTheDocument();
    expect(within(popover).getByText(/Close the Day · office day \(deposit date\)/)).toBeInTheDocument();
  });
});

describe('daily financial pulse', () => {
  it('a closed-out day shows its actual production and collections', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getByText("Today's closeout")).toBeInTheDocument();
    expect(screen.getByText('$8,150')).toBeInTheDocument(); // production
    expect(screen.getByText('$7,900')).toBeInTheDocument(); // collected
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
  it('production and collections each read against their own goal, on the office-day basis', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const production = screen.getByRole('meter', { name: /Production 5% of the \$160,000 goal/ });
    expect(production).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByRole('meter', { name: /Collections 4% of the \$150,000 goal/ })).toBeInTheDocument();
    expect(screen.getByText('5% of the $160,000 goal · on pace by office day 1 of 22.')).toBeInTheDocument();
    expect(screen.getByText('4% of the $150,000 goal · on pace by office day 1 of 22.')).toBeInTheDocument();
    expect(screen.getAllByText('On pace')).toHaveLength(2);
    expect(screen.getByText('How pace is calculated')).toBeInTheDocument();
    expect(screen.getByText(/Pace by office days/)).toBeInTheDocument();
  });

  it('a month on pace reads as on pace, with the expected figure', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getAllByText('On pace')).toHaveLength(2);
    expect(screen.getByText('Expected by now $14,545')).toBeInTheDocument();
  });

  it('a partially recorded month shows its totals with a partial-data label, the fix, and no behind verdict', () => {
    const { container } = renderView(<OwnerDashboard view={ownerPartialFixture} chartWidth={800} />);
    const meters = ownerPartialFixture.goalMeters!;
    expect(meters.map(m => [m.verdict, m.missingDays])).toEqual([['incomplete', 2], ['incomplete', 2]]);
    expect(screen.getAllByText('Partial data').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('link', { name: /Complete the records/ })[0]).toHaveAttribute('href', '/deposit-log');
    expect(container.textContent).not.toMatch(/behind (calendar )?pace/i);
    expect(screen.getAllByText(/2 office days not recorded, so pace is not judged/)).toHaveLength(2); // once per meter
    // The strip says so too, once per goal-bearing tile (production, collections, new patients), for this month.
    clickPreset('This month');
    expect(screen.getAllByText('Partial data · 2 office days not recorded')).toHaveLength(3);
    expect(screen.getByText(/of the 40 goal · pace is not judged until the records are complete/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/behind (calendar )?pace/i);
  });

  it('the new-patient tile is paced on office days like the meters, and names its basis', () => {
    renderView(<OwnerDashboard view={ownerFixture} chartWidth={800} />);
    clickPreset('This month');
    expect(screen.getByText(/of the 40 goal · (on pace|\d+ (ahead of|behind) pace) by office day \d+ of \d+/)).toBeInTheDocument();
    expect(screen.queryByText(/calendar pace/)).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: /^Production/ })).not.toBeInTheDocument();
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
    expect(screen.getByText('$8,150')).toBeInTheDocument();
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
  it('the month figure lives in the strip and the meter; nothing else repeats it', () => {
    const { container } = renderView(<OwnerDashboard view={ownerClosedFixture} chartWidth={800} />);
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    container.querySelectorAll('details, ul').forEach(el => el.remove());
    const collected = container.textContent!.match(/\$14,050/g) ?? [];
    expect(collected).toHaveLength(2); // the period tile and the goal meter
  });
});

describe('office states', () => {
  it('open office: live staffing stays available, quietly, and routine lateness is calm', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText('Staffing today')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Staffing today' })).getByText('In · late 12m')).toHaveClass('text-muted-foreground');
  });

  it('closed day: most recent business day labeled, no manufactured urgency', () => {
    const { container } = renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getAllByText(/Closed for the day/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/not in yet/i);
    expect(ownerClosedFixture.summary.lines).toEqual([]);
    expect(screen.getByText(/Nothing needs your attention right now\./)).toBeInTheDocument();
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
