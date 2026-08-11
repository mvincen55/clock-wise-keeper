import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import OwnerDashboard from '@/components/dashboard/OwnerDashboard';
import ManagerDashboard from '@/components/dashboard/ManagerDashboard';
import MemberDashboard from '@/components/dashboard/MemberDashboard';
import {
  managerNewFixture, memberNewFixture, ownerClosedFixture, ownerFixture, ownerNewFixture,
} from '@/components/dashboard/fixtures';

/**
 * Empty and off-hours states are a primary production experience. These tests
 * pin the corrected behavior:
 *  - a clear owner state celebrates instead of looking broken,
 *  - a closed office never shows "0/x on the floor" or invented exceptions,
 *  - setup empties offer their one next action,
 *  - the mobile floating support control is structurally out of the way of the
 *    bottom navigation,
 *  - attendance never headlines Owner Home.
 */

const renderView = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('owner — clear and closed states', () => {
  it('a clear decision queue is one calm line, never the definition of the day', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getByText(/No owner decisions are waiting\./)).toBeInTheDocument();
    // The old approvals-only hero is gone: zero approvals is not "all clear".
    expect(screen.queryByText(/You’re clear\./)).not.toBeInTheDocument();
  });

  it('a closed office shows office status, not live floor counts or exceptions', () => {
    renderView(<OwnerDashboard view={ownerClosedFixture} />);
    expect(screen.getAllByText(/Closed for the day/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/on the floor/i)).not.toBeInTheDocument();
    // No counted exceptions ("2 exceptions") may be invented off-hours.
    expect(screen.queryByText(/\d+\s+exceptions?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b0\/2\b/)).not.toBeInTheDocument();
    // Normal staffing disappears entirely when the day is over.
    expect(screen.queryByText(/Staffing today/i)).not.toBeInTheDocument();
  });

  it('owner home never headlines the attendance question or trend', () => {
    for (const view of [ownerFixture, ownerClosedFixture, ownerNewFixture]) {
      const { container, unmount } = renderView(<OwnerDashboard view={view} />);
      expect(container.textContent).not.toMatch(/getting here on time/i);
      expect(container.textContent).not.toMatch(/Arrivals, last 14 days/i);
      expect(container.textContent).not.toMatch(/does not hold production, collections/i);
      unmount();
    }
  });

  it('a brand-new office offers sprint setup instead of a wall of zeros', () => {
    renderView(<OwnerDashboard view={ownerNewFixture} />);
    expect(screen.getByText(/No office goal is running\./)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /Choose a goal/ });
    expect(cta).toHaveAttribute('href', '/goals');
  });
});

describe('manager — empty office', () => {
  it('clear queues celebrate, sprints offer setup, no floor claim off-hours', () => {
    renderView(<ManagerDashboard view={managerNewFixture} />);
    expect(screen.getByText(/Nothing outstanding\./)).toBeInTheDocument();
    expect(screen.getByText(/No team sprint is running\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Start a sprint/ })).toHaveAttribute('href', '/goals');
    expect(screen.queryByText(/on the floor/i)).not.toBeInTheDocument();
  });
});

describe('member — brand-new employee', () => {
  it('shows clear state and a goal setup action, never percent-from-nothing', () => {
    renderView(<MemberDashboard view={memberNewFixture} />);
    expect(screen.getByText(/You're clear\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Create a goal/ })).toHaveAttribute('href', '/goals');
    // The empty personal chart renders its no-data sentence, not a fake shape.
    expect(screen.getByText(/Nothing recorded in this window yet/)).toBeInTheDocument();
  });
});

describe('mobile navigation is never obscured by the floating support control', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it('the floating launcher is hidden below md and only floats on desktop', () => {
    const src = read('components/SupportWidget.tsx');
    const launcher = src.split('aria-label="Report a problem"')[1]?.split('>')[0] ?? '';
    expect(launcher).toContain('hidden');
    expect(launcher).toMatch(/md:flex/);
  });

  it('the open support panel sits above the nav + safe area on mobile', () => {
    const src = read('components/SupportWidget.tsx');
    expect(src).toMatch(/bottom-\[calc\(4rem\+env\(safe-area-inset-bottom\)/);
  });

  it('mobile can still reach support through the More sheet', () => {
    const src = read('components/AppLayout.tsx');
    expect(src).toContain('Report a Problem');
    expect(src).toContain("pe:open-support");
  });

  it('the bottom navigation reserves the safe-area inset', () => {
    const src = read('components/AppLayout.tsx');
    expect(src).toMatch(/nav className="md:hidden fixed inset-x-0 bottom-0[^"]*pb-\[env\(safe-area-inset-bottom\)\]/);
  });
});

describe('copy stays US-English and non-punitive on the dashboards', () => {
  it('no dashboard source uses UK spellings or surveillance framing', () => {
    const files = [
      'components/dashboard/useDashboardView.ts',
      'components/dashboard/OwnerDashboard.tsx',
      'components/dashboard/ManagerDashboard.tsx',
      'components/dashboard/MemberDashboard.tsx',
      'components/dashboard/kit.tsx',
      'components/dashboard/charts.tsx',
      'components/dashboard/fixtures.ts',
      'components/dashboard/scenarios.ts',
      'components/team/AttendanceTrendCard.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
      expect(src, f).not.toMatch(/utilisation|colour|organis(e|ation)|centre/i);
      expect(src, f).not.toMatch(/getting here on time\?/i);
      expect(src, f).not.toMatch(/the office AI/);
    }
  });
});
