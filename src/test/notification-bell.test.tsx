import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const markReadMutate = vi.fn();
const markAllReadMutate = vi.fn();

const NOTIFICATIONS = [
  {
    id: 'n1',
    org_id: 'org-1',
    recipient_user_id: 'user-1',
    actor_user_id: null,
    notification_type: 'pto_request_new',
    title: 'New PTO Request',
    message: 'Soleil submitted a PTO request for 2026-08-14 to 2026-08-14',
    related_table: 'pto_requests',
    related_id: 'pto-42',
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'n2',
    org_id: 'org-1',
    recipient_user_id: 'user-1',
    actor_user_id: null,
    notification_type: 'totally_unknown_type',
    title: 'Strange thing',
    message: 'A notification from the future',
    related_table: null,
    related_id: null,
    is_read: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'n3',
    org_id: 'org-1',
    recipient_user_id: 'user-1',
    actor_user_id: null,
    notification_type: 'incident_report_signed',
    title: 'Incident Report Signed',
    message: 'Your incident report from 2026-08-01 was signed.',
    related_table: 'incident_reports',
    related_id: 'rep-7',
    is_read: true,
    created_at: new Date().toISOString(),
  },
];

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: NOTIFICATIONS }),
  useUnreadCount: () => NOTIFICATIONS.filter(n => !n.is_read).length,
  useMarkNotificationRead: () => ({ mutate: markReadMutate }),
  useMarkAllRead: () => ({ mutate: markAllReadMutate }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const orgCtx = { role: 'manager' as string };
vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({ data: { org_id: 'org-1', role: orgCtx.role } }),
}));

vi.mock('@/hooks/useTick', () => ({
  useTick: () => new Date(),
}));

// Support-ticket side query: return an empty list through the builder chain.
vi.mock('@/integrations/supabase/client', () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});

import NotificationBell from '@/components/NotificationBell';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/start']}>
        <NotificationBell />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const openBell = () => fireEvent.click(screen.getByRole('button', { name: /notifications/i }));

describe('NotificationBell interactions', () => {
  beforeEach(() => {
    markReadMutate.mockReset();
    markAllReadMutate.mockReset();
    orgCtx.role = 'manager';
  });

  it('opening the bell shows rows without marking anything read', async () => {
    renderBell();
    openBell();
    expect(await screen.findByText('New PTO Request')).toBeInTheDocument();
    // The row itself is readable without hover: title, message, time.
    expect(screen.getByText(/Soleil submitted a PTO request/)).toBeInTheDocument();
    expect(screen.getAllByText(/ago|less than/i).length).toBeGreaterThan(0);
    expect(markReadMutate).not.toHaveBeenCalled();
    expect(markAllReadMutate).not.toHaveBeenCalled();
  });

  it('hovering a notification does not mark it read', async () => {
    renderBell();
    openBell();
    const row = await screen.findByText('New PTO Request');
    fireEvent.mouseOver(row);
    fireEvent.mouseEnter(row);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(markReadMutate).not.toHaveBeenCalled();
  });

  it('clicking navigates to the resolved destination and then marks read', async () => {
    renderBell();
    openBell();
    fireEvent.click(await screen.findByText('New PTO Request'));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/approvals?tab=pto-requests&request=pto-42')
    );
    expect(markReadMutate).toHaveBeenCalledWith('n1');
  });

  it('routes the same event to the employee surface for employees', async () => {
    orgCtx.role = 'employee';
    renderBell();
    openBell();
    fireEvent.click(await screen.findByText('New PTO Request'));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/pto?request=pto-42')
    );
  });

  it('clicking an already-read notification navigates without re-marking', async () => {
    renderBell();
    openBell();
    fireEvent.click(await screen.findByText('Incident Report Signed'));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/incident-reports?report=rep-7')
    );
    expect(markReadMutate).not.toHaveBeenCalled();
  });

  it('an unknown notification type never dead-clicks or crashes the bell', async () => {
    renderBell();
    openBell();
    fireEvent.click(await screen.findByText('Strange thing'));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
    expect(markReadMutate).toHaveBeenCalledWith('n2');
  });

  it('keeps read notifications visible and supports Mark all read', async () => {
    renderBell();
    openBell();
    // Read rows do not disappear.
    expect(await screen.findByText('Incident Report Signed')).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Mark all read/i));
    expect(markAllReadMutate).toHaveBeenCalledTimes(1);
  });
});

