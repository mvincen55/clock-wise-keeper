/** Team dashboard: shared financial goals, the member’s chosen goal, their own
 * work and time. Office visibility rules and existing record links still apply. */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import {
  assistantFixture, frontDeskBackupAssistFixture, frontDeskBackupOnlyFixture, frontDeskFixture, hygienistFixture, memberClearFixture,
  memberHiddenFinancialsFixture, memberLateArrivalFixture, memberNewFixture,
} from '@/components/dashboard/fixtures';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('my next move leads', () => {
  it('the next action renders before any time or PTO content, and is the first item of the queue', () => {
    const { container } = renderView(<MemberDashboard view={frontDeskFixture} />);
    const text = container.textContent!;
    expect(text.indexOf('Needs you')).toBeLessThan(text.indexOf('My time & PTO'));
    expect(frontDeskFixture.work.next?.kind).toBe('reply');
    expect(screen.getAllByText('1 office request waiting on your reply')).toHaveLength(1); // the queue has one copy of the next action
    expect(screen.getAllByRole('link', { name: /^Reply/ })[0]).toHaveAttribute('href', '/inbox/requests');
  });

  it('nothing assigned reads as a genuine all-clear, not a zero wall', () => {
    renderView(<MemberDashboard view={memberClearFixture} />);
    expect(screen.getByText(/You’re clear\. Nothing is assigned to you right now\./)).toBeInTheDocument();
    expect(screen.getByText(/New items will appear here and in your inbox/)).toBeInTheDocument();
  });
});

describe('needs you — my own items', () => {
  it('a late arrival waits on my answer, the attendance report on my signature, and my requests on a manager', () => {
    renderView(<MemberDashboard view={memberLateArrivalFixture} />);
    expect(memberLateArrivalFixture.work.now.map(i => i.kind)).toEqual(['attendance_report', 'late_arrival', 'acknowledgment']);
    expect(screen.getAllByText('Sign your attendance report')).toHaveLength(1);
    const sign = document.querySelector('[data-work-id="attendance_report:i-att-1"]') as HTMLElement;
    expect(within(sign).getByRole('link', { name: /Read and sign/ })).toHaveAttribute('href', '/incident-reports?report=i-att-1');
    expect(within(sign).getByText(/not agreement with every statement/)).toBeInTheDocument();
    const late = document.querySelector('[data-work-id="late_arrival:t-0302"]') as HTMLElement;
    expect(within(late).getByRole('link', { name: /^Answer/ })).toHaveAttribute('href', '/days-off?tardy=t-0302');
    expect(within(late).getByText(/No explanation is required to acknowledge/)).toBeInTheDocument();
    const waiting = screen.getByRole('button', { name: /Waiting on someone else/ });
    expect(waiting).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(waiting);
    expect(screen.getByText('Excuse request · Tue, Feb 24, 2026')).toBeInTheDocument();
    expect(screen.getByText(/Pending a manager’s decision\. It does not count/)).toBeInTheDocument();
    expect(screen.getByText('PTO request · Fri, Mar 20, 2026')).toBeInTheDocument();
    expect(screen.getByText('Requests pending')).toBeInTheDocument();
  });

  it('shows where I stand against the office’s late-arrival rule, as a count in a window, never a verdict', () => {
    renderView(<MemberDashboard view={memberLateArrivalFixture} />);
    expect(screen.getByText('Late arrivals: 2 of 3 unexcused late arrivals in the last 30 days · 1 excuse request pending.')).toHaveAttribute('href', '/days-off');
    expect(hygienistFixture.attendanceStanding).toBeNull();
  });

  it('every row opens its exact record', () => {
    renderView(<MemberDashboard view={frontDeskFixture} />);
    for (const item of [...frontDeskFixture.work.now, ...frontDeskFixture.work.waiting]) expect(item.href).toMatch(/^\//);
    const ack = document.querySelector('[data-work-id="acknowledgment:ack1"]') as HTMLElement;
    // The title and the action are both links to the same record.
    const ackLinks = within(ack).getAllByRole('link', { name: /Read and sign/ });
    expect(ackLinks.length).toBeGreaterThan(0);
    for (const a of ackLinks) expect(a).toHaveAttribute('href', '/management/office/acknowledgments?assignment=ack1');
    const training = document.querySelector('[data-work-id="training:ta1"]') as HTMLElement;
    expect(within(training).getByRole('link', { name: /Open training/ })).toHaveAttribute('href', '/training?assignment=ta1&tab=mine');
  });
});

describe('our office pulse', () => {
  it('shows shared office values and targets together, without admin controls', () => {
    renderView(<MemberDashboard view={hygienistFixture} />);
    const goals = screen.getByRole('region', { name: 'Our office goals this month' });
    expect(within(goals).getByText('$7,420')).toBeInTheDocument();
    expect(within(goals).getByText('$6,150')).toBeInTheDocument();
    expect(within(goals).getByRole('meter', { name: /Production 5% of the \$160,000 goal/ })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Financial data source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Report history/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Set a production goal/ })).not.toBeInTheDocument();
  });

  it('labels the financial figures as office totals updated after Close the Day', () => {
    renderView(<MemberDashboard view={hygienistFixture} />);
    expect(screen.getByText('Office totals update after Close the Day.')).toBeInTheDocument();
  });

  it('admin-only metrics are omitted cleanly — no teaser, no lock, no dollar figure anywhere', () => {
    const { container } = renderView(<MemberDashboard view={memberHiddenFinancialsFixture} chartWidth={700} />);
    expect(container.textContent).not.toMatch(/Production|Collections|\$/);
    expect(screen.queryByTestId('performance-chart-frame')).not.toBeInTheDocument();
    expect(screen.queryByRole('meter', { name: /Production|Collections/ })).not.toBeInTheDocument();
    expect(screen.getByText('New patients seen')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bhidden\b|\blocked\b|admins only/i); // "clocked out" is fine
  });
});

describe('role-relevant emphasis', () => {
  it('front desk gets the new-patient pipeline', () => {
    renderView(<MemberDashboard view={frontDeskFixture} />);
    expect(screen.getByText('New patients scheduled')).toBeInTheDocument();
    expect(screen.getByText('3 this week')).toBeInTheDocument();
  });

  it('a hygienist gets hygiene-side disruption, not front-desk emphasis', () => {
    const { container } = renderView(<MemberDashboard view={hygienistFixture} />);
    expect(screen.getByText(/Hygiene cancellations \+ no-shows this month/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('New patients scheduled');
  });

  it('a dental assistant gets no financial role emphasis, and today’s open checklist items in the queue', () => {
    expect(assistantFixture.rolePulse).toHaveLength(0);
    renderView(<MemberDashboard view={assistantFixture} />);
    expect(screen.getByText('2 checklist items open today').closest('a')).toHaveAttribute('href', '/checklists');
  });
});

describe('backup vs covering', () => {
  it('a backup capability adds nothing to the queue; its tools are revealed on request', () => {
    renderView(<MemberDashboard view={frontDeskBackupOnlyFixture} />);
    expect(screen.queryByRole('region', { name: /Covering today/ })).not.toBeInTheDocument();
    expect(screen.getByText('Backup: Dental assistant')).toBeInTheDocument();
    const tools = screen.getByRole('region', { name: 'Tools' });
    expect(within(tools).queryByText('Dental assistant')).not.toBeInTheDocument();
    fireEvent.click(within(tools).getByRole('button', { name: /More tools/ }));
    expect(within(tools).getByText('Dental assistant')).toBeInTheDocument();
    expect(within(tools).getByText(/Backup — can cover, not assigned today/)).toBeInTheDocument();
    const hrefs = within(tools).getAllByRole('link').map(a => a.getAttribute('href'));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('a role covered today elevates its time-sensitive work and its tools', () => {
    renderView(<MemberDashboard view={frontDeskBackupAssistFixture} />);
    const lane = screen.getByRole('region', { name: 'Covering today · Dental assistant' });
    expect(within(lane).getByText('Checklist bypass reasons owed')).toBeInTheDocument();
    expect(screen.getByText('Covering today: Dental assistant')).toBeInTheDocument();
    const tools = screen.getByRole('region', { name: 'Tools' });
    expect(within(tools).getByText('Dental assistant')).toBeInTheDocument();
    expect(within(tools).getByText('Covering today')).toBeInTheDocument();
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
    expect(screen.getAllByText('Not clocked in').length).toBeGreaterThan(0);
  });
});
