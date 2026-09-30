/**
 * The Home columns flow independently: the main column's next panel follows
 * its previous one whatever the sidebar's height, so a short (or empty)
 * queue never leaves a gap above the financial block; the sidebar holds
 * today, the latest closeout with its state in one panel, and the
 * cancellation trend scoped to the main column's period row, and stays in
 * view while the main column scrolls; the month's goals sit in the board
 * above both columns; Worth a look runs at full width under them; under lg
 * the panels read actions first.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import {
  hygienistFixture, managerClearFixture, managerFixture, managerNewFixture, memberClearFixture, ownerClearFixture, ownerFixture, ownerOffCalendarFixture,
} from '@/components/dashboard/fixtures';

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

/** The two column wrappers, in DOM order: main, then the sidebar. */
function columns(container: HTMLElement): { main: HTMLElement; aside: HTMLElement } {
  const root = container.querySelector('[data-home-columns]') as HTMLElement;
  expect(root).not.toBeNull();
  const [main, aside] = Array.from(root.children) as HTMLElement[];
  return { main, aside };
}

/** Each region's accessible name: its aria-label, or the heading it is labelled by. */
const regionNames = (el: HTMLElement) => within(el).getAllByRole('region').map(r => r.getAttribute('aria-label') ?? document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent ?? null);
const slotOrder = (el: HTMLElement) => Number((el.closest('[data-home-slot]') as HTMLElement).style.order);

describe('the main column follows the queue', () => {
  it('manager: the performance block is the queue’s next sibling in the main column; today, the closeout, and the cancellation trend sit in the sidebar, which stays in view', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    const { main, aside } = columns(container);
    expect(regionNames(main)).toEqual(['Needs you', 'Mine', 'Office performance']);
    expect(regionNames(aside)).toEqual(['Today', "Yesterday's closeout", 'Cancellations and no-shows']);
    expect(aside.className).toMatch(/\blg:sticky\b.*\blg:top-4\b/);
    // Worth a look runs under both columns; the goals sit in the board above them.
    const root = container.querySelector('[data-home-columns]') as HTMLElement;
    const look = screen.getByRole('region', { name: 'Worth a look' });
    expect(root.contains(look)).toBe(false);
    expect(root.compareDocumentPosition(look) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Goals this month' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Right now' })).getByRole('list', { name: 'Goals this month' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Status' })).not.toBeInTheDocument();
    // Nothing reserves height: the columns, the slots, and the panels themselves carry no
    // stretch or minimum height (a meter's 8px fill bar inside a panel is not a reserved height).
    for (const el of Array.from(container.querySelectorAll('[data-home-columns], [data-home-column], [data-home-slot], [data-home-slot] > *'))) {
      expect(el.getAttribute('class') ?? '').not.toMatch(/\b(h-full|min-h-|lg:items-stretch|self-stretch)/);
    }
  });

  it('manager with nothing waiting: the queue stays compact with its parked items, and the numbers follow it directly', () => {
    const { container } = renderView(<ManagerDashboard view={managerClearFixture} chartWidth={800} />);
    const { main, aside } = columns(container);
    const queue = within(main).getByRole('region', { name: 'Needs you' });
    expect(within(queue).getByText('Nothing is waiting on you.')).toBeInTheDocument();
    expect(within(queue).getByRole('button', { name: /Parked/ })).toHaveAttribute('aria-expanded', 'false');
    expect(queue.nextElementSibling).toBeNull(); // the slot holds only the panel
    const slots = Array.from(main.children) as HTMLElement[];
    expect(slots.map(s => within(s).queryByRole('region', { name: 'Needs you' }) ? 'queue' : within(s).queryByRole('region', { name: 'Office performance' }) ? 'performance' : 'other')).toEqual(['queue', 'performance']);
    // The closeout panel carries its own state — no separate Status card.
    const closeout = within(aside).getByRole('region', { name: "Yesterday's closeout" });
    expect(within(closeout).getByText('Sealed')).toBeInTheDocument();
    expect(within(closeout).getByText('$7,420')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Status' })).not.toBeInTheDocument();
    expect(within(aside).getByRole('region', { name: 'Today' })).toBeInTheDocument();
  });

  it('the closeout state reads as a chip: not sealed while the queue carries the task, and a setup door when none is on record', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const open = screen.getByRole('region', { name: "Yesterday's closeout" });
    expect(within(open).getByText('Not sealed')).toBeInTheDocument();
    expect(within(open).queryByRole('link', { name: /^Open/ })).not.toBeInTheDocument(); // the queue row is the action
    renderView(<ManagerDashboard view={managerNewFixture} />);
    const fresh = screen.getByRole('region', { name: 'Last closeout' });
    expect(within(fresh).getByRole('link', { name: /Close out a day/ })).toHaveAttribute('href', '/deposit-log');
  });

  it('owner: the same shape — Today (exceptions and the count line, never the roster), the closeout with its state, the cancellation trend', () => {
    const { container } = renderView(<OwnerDashboard view={ownerClearFixture} chartWidth={800} />);
    const { main, aside } = columns(container);
    expect(regionNames(main)).toEqual(['Needs you', 'Office performance']);
    expect(regionNames(aside)).toEqual(['Today', "Yesterday's closeout", 'Cancellations and no-shows']);
    expect(within(aside).getByText('Sealed')).toBeInTheDocument();
    expect(within(main).getByText('No owner decisions are waiting.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Office challenge' })).not.toBeInTheDocument();
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText('Not sealed')).toBeInTheDocument();
  });

  it('the cancellation trend in the sidebar follows the period row in the main column', () => {
    renderView(<OwnerDashboard view={ownerClearFixture} chartWidth={800} />);
    const panel = () => screen.getByRole('region', { name: 'Cancellations and no-shows' });
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    expect(within(panel()).getByText('Mar 1 – Mar 3, 2026')).toBeInTheDocument();
    expect(within(panel()).getAllByRole('link', { name: /^Missed appointments/ })[0]).toHaveAttribute('href', '/management/missed-appointments?start=2026-03-01&end=2026-03-03');
    fireEvent.click(screen.getByRole('button', { name: 'Last month' }));
    expect(within(panel()).getByText('Feb 1 – Feb 28, 2026')).toBeInTheDocument();
  });

  it('member: my work then the office pulse in the main column; role facts, the goal, time & PTO, and the goal meters in the sidebar', () => {
    const { container } = renderView(<MemberDashboard view={hygienistFixture} chartWidth={700} />);
    const { main, aside } = columns(container);
    expect(regionNames(main)).toEqual(['Needs you', 'Our office pulse', 'Office performance']);
    expect(regionNames(aside)).toEqual(['For my role', 'Office goal', 'My time & PTO', 'Goals this month']);
    const clear = renderView(<MemberDashboard view={memberClearFixture} />);
    const { main: clearMain } = columns(clear.container);
    expect(within(clearMain).getByText('You’re clear.')).toBeInTheDocument();
  });
});

describe('the status board at the top', () => {
  it('names everyone on the roster as a chip with their own status; each chip opens the person’s record', () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const board = screen.getByRole('list', { name: 'Who is where' });
    const chips = within(board).getAllByRole('listitem');
    expect(chips.map(li => li.textContent)).toEqual(['Dana R.In', 'Marcus T.In · late 12m', 'Priya S.In', 'Alice N.In · remote', 'Ken W.Not in yet', 'Sam K.Later · 1:00 PM', 'Jo B.Off', 'Rita M.Done']);
    expect(within(chips[1]).getByRole('link')).toHaveAttribute('href', '/management/people/2');
    expect(within(chips[4]).getByRole('link')).toHaveAttribute('href', '/management/people/5');
    expect(screen.queryByRole('list', { name: 'Closeouts by office day' })).not.toBeInTheDocument();
  });

  it('hovering (or focusing) a chip shows the person’s schedule for today: the shift, remote, minutes late', async () => {
    renderView(<ManagerDashboard view={managerFixture} />);
    const board = screen.getByRole('list', { name: 'Who is where' });
    const marcus = within(board).getByRole('link', { name: /Marcus T\./ });
    fireEvent.focus(marcus);
    const card = await screen.findByText('Today’s shift');
    const content = card.closest('[data-state]') as HTMLElement;
    expect(within(content).getByText('8:00 AM – 5:00 PM')).toBeInTheDocument();
    expect(within(content).getByText('12 min after the start')).toBeInTheDocument();
    expect(within(content).getByText('In · late 12m')).toBeInTheDocument();
    expect(within(content).getByText('Open their record in People')).toBeInTheDocument();
    expect(marcus).toHaveAccessibleDescription(/Marcus T\.: In · late 12m, scheduled 8:00 AM – 5:00 PM, arrived 12 minutes after the scheduled start/);
    fireEvent.blur(marcus);
    fireEvent.focus(within(board).getByRole('link', { name: /Alice N\./ }));
    expect(await screen.findByText('Remotely today')).toBeInTheDocument();
  });

  it('the month sits in the board: production and collections on the office-day pace, then the challenge with its state', () => {
    renderView(<OwnerDashboard view={ownerFixture} />);
    const board = screen.getByRole('region', { name: 'Right now' });
    const month = within(board).getByRole('list', { name: 'Goals this month' });
    const cells = within(month).getAllByRole('listitem');
    expect(cells.map(c => c.querySelector('p')?.textContent)).toEqual(['Production', 'Collections', 'Challenge']);
    expect(within(cells[0]).getByRole('meter', { name: /Production 5% of the \$160,000 goal/ })).toBeInTheDocument();
    expect(within(cells[1]).getByText('On pace')).toBeInTheDocument();
    expect(within(cells[2]).getByText('Morning huddle on time')).toBeInTheDocument();
    expect(within(cells[2]).getByText('On track')).toBeInTheDocument();
    expect(within(board).getByRole('link', { name: /^Goals/ })).toHaveAttribute('href', '/goals');
    expect(within(board).getByText('How pace is calculated')).toBeInTheDocument();
    // The roster and the priorities come before the month.
    const text = board.textContent!;
    expect(text.indexOf('Dana R.')).toBeLessThan(text.indexOf('This month'));
    expect(text.indexOf('Payroll hours are due')).toBeLessThan(text.indexOf('This month'));
  });

  it('no strip tracks closeouts; an office day with no closeout reaches the board only as the meters’ partial-data label and the fix', () => {
    renderView(<OwnerDashboard view={ownerOffCalendarFixture} />);
    expect(screen.queryByRole('list', { name: 'Closeouts by office day' })).not.toBeInTheDocument();
    const month = screen.getByRole('list', { name: 'Goals this month' });
    expect(within(month).getAllByText('Partial data')).toHaveLength(2);
    expect(within(month).getAllByRole('link', { name: /Complete the records/ })[0]).toHaveAttribute('href', '/deposit-log');
    expect(ownerOffCalendarFixture.summary.lines.map(l => l.id)).not.toContain('closeout-missing'); // Mar 11 is on record; the gap is Mar 5, inside the month
  });
});

describe('under lg the columns dissolve into one reading order', () => {
  it('actions first, then today and the closeout, then the numbers, then the cancellation trend', () => {
    renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    const order = (name: string) => slotOrder(screen.getByRole('region', { name }));
    expect(order('Needs you')).toBeLessThan(order('Mine'));
    expect(order('Mine')).toBeLessThan(order('Today'));
    expect(order('Today')).toBeLessThan(order("Yesterday's closeout"));
    expect(order("Yesterday's closeout")).toBeLessThan(order('Office performance'));
    expect(order('Office performance')).toBeLessThan(order('Cancellations and no-shows'));
  });

  it('the column wrappers dissolve (display: contents) below lg and become block columns at lg', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />);
    const { main, aside } = columns(container);
    for (const col of [main, aside]) expect(col.className).toMatch(/\bcontents\b.*\blg:block\b/);
    expect((container.querySelector('[data-home-columns]') as HTMLElement).className).toMatch(/\blg:grid\b.*\blg:items-start\b/);
  });
});
