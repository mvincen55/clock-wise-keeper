/**
 * The Home columns flow independently: the main column's next panel follows
 * its previous one whatever the sidebar's height, so a short (or empty)
 * queue never leaves a gap above the financial block; the sidebar holds
 * today, the latest closeout with its state in one panel, the goals, and the
 * rest of the secondary information; under lg the panels read actions first.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import {
  hygienistFixture, managerClearFixture, managerFixture, managerNewFixture, memberClearFixture, ownerClearFixture, ownerFixture,
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
  it('manager: the performance block is the queue’s next sibling in the main column; today, the closeout, and the goals sit in the sidebar', () => {
    const { container } = renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    const { main, aside } = columns(container);
    const mainRegions = regionNames(main);
    expect(mainRegions.indexOf('Needs you')).toBe(0);
    expect(mainRegions.indexOf('Office performance')).toBeGreaterThan(mainRegions.indexOf('Mine'));
    expect(within(main).getByText('Cancellations and no-shows')).toBeInTheDocument();
    const asideRegions = regionNames(aside);
    expect(asideRegions.slice(0, 4)).toEqual(['Today', "Yesterday's closeout", 'Goals this month', 'Worth a look']);
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

  it('owner: the same shape, with staffing first in the sidebar and the closeout carrying its state', () => {
    const { container } = renderView(<OwnerDashboard view={ownerClearFixture} chartWidth={800} />);
    const { main, aside } = columns(container);
    expect(regionNames(main)).toEqual(['Needs you', 'Office performance', 'Cancellations and no-shows']);
    expect(regionNames(aside).slice(0, 4)).toEqual(['Staffing today', "Yesterday's closeout", 'Goals this month', 'Office challenge']);
    expect(within(aside).getByText('Sealed')).toBeInTheDocument();
    expect(within(main).getByText('No owner decisions are waiting.')).toBeInTheDocument();
    renderView(<OwnerDashboard view={ownerFixture} />);
    expect(screen.getByText('Not sealed')).toBeInTheDocument();
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

describe('under lg the columns dissolve into one reading order', () => {
  it('actions first, then today and the closeout, then the numbers, then the goals', () => {
    renderView(<ManagerDashboard view={managerFixture} chartWidth={800} />);
    const order = (name: string) => slotOrder(screen.getByRole('region', { name }));
    expect(order('Needs you')).toBeLessThan(order('Mine'));
    expect(order('Mine')).toBeLessThan(order('Today'));
    expect(order('Today')).toBeLessThan(order("Yesterday's closeout"));
    expect(order("Yesterday's closeout")).toBeLessThan(order('Office performance'));
    expect(order('Office performance')).toBeLessThan(order('Goals this month'));
    expect(order('Goals this month')).toBeLessThan(order('Worth a look'));
  });

  it('the column wrappers dissolve (display: contents) below lg and become block columns at lg', () => {
    const { container } = renderView(<OwnerDashboard view={ownerFixture} />);
    const { main, aside } = columns(container);
    for (const col of [main, aside]) expect(col.className).toMatch(/\bcontents\b.*\blg:block\b/);
    expect((container.querySelector('[data-home-columns]') as HTMLElement).className).toMatch(/\blg:grid\b.*\blg:items-start\b/);
  });
});
