/** Approved dashboard hierarchy: performance and action queue, chosen goals,
 * one attendance surface, and tools available on demand. */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import { hygienistFixture, managerClearFixture, managerFixture, ownerClearFixture, ownerFixture, ownerOffCalendarFixture } from '@/components/dashboard/fixtures';
const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('performance and goals near the top', () => {
  it('manager has stats and the chart beside the real queue, then chosen goals and one attendance panel', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={700} />);
    const performance = screen.getByRole('region', { name: 'Practice performance' });
    expect(within(performance).getByRole('region', { name: 'Needs you' })).toBeInTheDocument();
    expect(within(performance).getByRole('region', { name: 'Collections over time' }).querySelector('svg')).not.toBeNull();
    const text = container.textContent!;
    expect(text.indexOf('How we’re doing')).toBeLessThan(text.indexOf('Active goals'));
    expect(text.indexOf('Active goals')).toBeLessThan(text.indexOf('Team today'));
    expect(screen.getAllByRole('region', { name: 'Team today' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Right now' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Today' })).not.toBeInTheDocument();
  });
  it('a clear queue stays compact and keeps parked items accessible', () => {
    renderView(<ManagerDashboard view={managerClearFixture} />);
    const queue = screen.getByRole('region', { name: 'Needs you' });
    expect(within(queue).getByText('Nothing is waiting on you.')).toBeInTheDocument();
    expect(within(queue).getByRole('button', { name: /Parked/ })).toHaveAttribute('aria-expanded', 'false');
  });
  it('owner opens on YTD with the three-year summary beside the chart', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByRole('button', { name: 'Year to date', pressed: true })).toBeInTheDocument();
    const years = screen.getByRole('region', { name: 'Across the years' });
    for (const year of ['2026 · Current', '2025', '2024']) expect(within(years).getByText(year)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Needs you' })).toBeInTheDocument();
  });
  it('the cancellation trend and links follow the selected period and completed-day cutoff', () => {
    renderView(<OwnerDashboard view={ownerClearFixture} />);
    const panel = () => screen.getByRole('region', { name: 'Cancellations and no-shows' });
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(within(panel()).getAllByRole('link', { name: /^Missed appointments/ })[0]).toHaveAttribute('href', '/management/missed-appointments?start=2026-03-01&end=2026-03-02');
    fireEvent.click(screen.getByRole('button', { name: 'Year to date' }));
    expect(within(panel()).getAllByRole('link', { name: /^Missed appointments/ })[0]).toHaveAttribute('href', '/management/missed-appointments?start=2026-01-01&end=2026-03-02');
  });
  it('member financial goals and chosen goals precede personal work and time', () => {
    const { container } = renderView(<MemberDashboard view={hygienistFixture} />);
    const text = container.textContent!;
    expect(text.indexOf('Our office goals this month')).toBeLessThan(text.indexOf('My chosen goal'));
    expect(text.indexOf('My chosen goal')).toBeLessThan(text.indexOf('My time & PTO'));
    expect(screen.getAllByText(hygienistFixture.goal!.title)).toHaveLength(1);
  });
  it('incomplete records never produce a false behind-pace verdict', () => {
    const { container } = renderView(<OwnerDashboard view={ownerOffCalendarFixture} />);
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(within(screen.getByRole('region', { name: 'Collections' })).getAllByText('Partial records').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/Below expected pace/);
    expect(screen.queryByRole('list', { name: 'Closeouts by office day' })).not.toBeInTheDocument();
  });
});

describe('one roster with useful schedules', () => {
  it('keeps every person linked to their own record inside the expandable team panel', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const team = screen.getByRole('region', { name: 'Team today' });
    fireEvent.click(within(team).getByText(/View team/));
    const roster = within(team).getByRole('list', { name: 'Who is where' });
    const chips = within(roster).getAllByRole('listitem');
    expect(chips.map(li => li.textContent)).toEqual(['Dana R.In', 'Marcus T.In · late 12m', 'Priya S.In', 'Alice N.In · remote', 'Ken W.Not in yet', 'Sam K.Later · 1:00 PM', 'Jo B.Off', 'Rita M.Done']);
    expect(within(chips[1]).getByRole('link')).toHaveAttribute('href', '/management/people/2');
    expect(within(chips[4]).getByRole('link')).toHaveAttribute('href', '/management/people/5');
  });
  it('focusing a person shows their shift, late minutes, and remote status', async () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    fireEvent.click(screen.getByText(/View team/));
    const roster = screen.getByRole('list', { name: 'Who is where' });
    const marcus = within(roster).getByRole('link', { name: /Marcus T\./ });
    fireEvent.focus(marcus);
    const card = await screen.findByText('Today’s shift');
    const content = card.closest('[data-state]') as HTMLElement;
    expect(within(content).getByText('8:00 AM – 5:00 PM')).toBeInTheDocument();
    expect(within(content).getByText('12 min after the start')).toBeInTheDocument();
    expect(marcus).toHaveAccessibleDescription(/Marcus T\.: In · late 12m, scheduled 8:00 AM – 5:00 PM/);
    fireEvent.blur(marcus); fireEvent.focus(within(roster).getByRole('link', { name: /Alice N\./ }));
    expect(await screen.findByText('Remotely today')).toBeInTheDocument();
  });
});
