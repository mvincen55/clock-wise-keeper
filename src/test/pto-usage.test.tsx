/**
 * PTO usage (src/lib/pto-usage.ts, UsePtoDialog, PtoUsageEntry): the hours a
 * person records as used are the whole record — nothing is derived from a
 * day off — and the bank reads only rows that were not taken back.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { activePtoUsage, groupPtoUsageByEmployee, ptoHoursBetween, ptoUsageProblem, formatPtoHours, type PtoUsageRow } from '@/lib/pto-usage';

const row = (over: Partial<PtoUsageRow> = {}): PtoUsageRow => ({
  id: 'u1', org_id: 'org', employee_id: 'e1', user_id: 'user-1', usage_date: '2026-10-09', hours: 8, note: '', source: 'employee',
  day_off_id: null, created_by: 'user-1', created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T10:00:00Z',
  voided_at: null, voided_by: null, void_reason: null, ...over,
});

describe('PTO usage arithmetic', () => {
  it('counts only rows that were not taken back, inside the period', () => {
    const rows = [
      row({ id: 'a', usage_date: '2026-10-05', hours: 4 }),
      row({ id: 'b', usage_date: '2026-10-09', hours: 8 }),
      row({ id: 'c', usage_date: '2026-10-09', hours: 2, voided_at: '2026-10-06T00:00:00Z' }),
      row({ id: 'd', usage_date: '2026-10-12', hours: 8 }),
    ];
    expect(activePtoUsage(rows).map(r => r.id)).toEqual(['a', 'b', 'd']);
    expect(ptoHoursBetween(rows, '2026-10-04', '2026-10-10')).toBe(12);
    expect(ptoHoursBetween(rows, '2026-10-10', '2026-10-16')).toBe(8);
  });
  it('groups a period per team member, oldest first, with a per-person total', () => {
    const rows = [
      row({ id: 'a', employee_id: 'e2', usage_date: '2026-10-08', hours: 3.5 }),
      row({ id: 'b', employee_id: 'e1', usage_date: '2026-10-09', hours: 8 }),
      row({ id: 'c', employee_id: 'e1', usage_date: '2026-10-07', hours: 1.25 }),
      row({ id: 'x', employee_id: 'e1', usage_date: '2026-09-30', hours: 8 }),
    ];
    const groups = groupPtoUsageByEmployee(rows, '2026-10-04', '2026-10-10');
    expect(groups.map(g => [g.employeeId, g.hours, g.rows.map(r => r.id)])).toEqual([
      ['e2', 3.5, ['a']],
      ['e1', 9.25, ['c', 'b']],
    ]);
  });
  it('prints hours to the hundredth', () => {
    expect(formatPtoHours(8)).toBe('8.00h');
    expect(formatPtoHours('2.5')).toBe('2.50h');
  });
});

describe('what the Use PTO dialog says before the bank guard does', () => {
  const base = { usageDate: '2026-10-09', available: 10, allowNegative: false, displayName: 'Dore, Karen J' };
  it('needs a date and positive hours', () => {
    expect(ptoUsageProblem({ ...base, usageDate: '', hours: '8' })).toMatch(/date/);
    expect(ptoUsageProblem({ ...base, hours: '' })).toMatch(/Enter the PTO hours/);
    expect(ptoUsageProblem({ ...base, hours: '0' })).toMatch(/more than 0/);
    expect(ptoUsageProblem({ ...base, hours: '-2' })).toMatch(/more than 0/);
    expect(ptoUsageProblem({ ...base, hours: '401' })).toMatch(/at most 400/);
  });
  it('refuses more than the bank holds unless the person may go negative', () => {
    expect(ptoUsageProblem({ ...base, hours: '10' })).toBeNull();
    expect(ptoUsageProblem({ ...base, hours: '10.01' })).toBe('Not enough PTO: Dore, Karen J has 10.00 hours available and this would use 10.01.');
    expect(ptoUsageProblem({ ...base, hours: '40', allowNegative: true })).toBeNull();
    expect(ptoUsageProblem({ ...base, hours: '1', available: null })).toMatch(/No PTO starting balance is on file for Dore, Karen J/);
    expect(ptoUsageProblem({ ...base, hours: '1', available: null, allowNegative: true })).toBeNull();
  });
});

/* ---------------- the dialog and the entry row ---------------- */

const rpc = vi.fn();
vi.mock('@/integrations/supabase/pending-schema', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'org', employee_id: 'e1', role: 'employee' } }) }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { UsePtoDialog } from '@/components/pto/UsePtoDialog';
import { PtoUsageEntry } from '@/pages/PTO';

function withClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('UsePtoDialog', () => {
  beforeEach(() => {
    cleanup();
    rpc.mockReset();
    toast.mockReset();
    rpc.mockImplementation(async (name: string) => {
      if (name === 'pto_available_hours') return { data: 12.5, error: null };
      if (name === 'pto_allows_negative') return { data: false, error: null };
      if (name === 'record_pto_usage') return { data: row({ hours: 8 }), error: null };
      return { data: null, error: null };
    });
  });

  it('records the hours through record_pto_usage for the one member it was opened for', async () => {
    const onClose = vi.fn();
    withClient(<UsePtoDialog open onClose={onClose} members={[{ employeeId: 'e1', displayName: 'Dore, Karen J' }]} initialDate="2026-10-09" />);
    await screen.findByText(/Available now/);
    expect(screen.getByText('12.50h')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('PTO hours'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'short week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record PTO hours' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('record_pto_usage', { p_employee_id: 'e1', p_usage_date: '2026-10-09', p_hours: 8, p_note: 'short week' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'PTO hours recorded' }));
  });

  it('says what the bank guard would say and never calls the server', async () => {
    withClient(<UsePtoDialog open onClose={vi.fn()} members={[{ employeeId: 'e1', displayName: 'Dore, Karen J' }]} initialDate="2026-10-09" />);
    await screen.findByText(/Available now/);
    fireEvent.change(screen.getByLabelText('PTO hours'), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record PTO hours' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough PTO: Dore, Karen J has 12.50 hours available and this would use 13.00.');
    expect(rpc).not.toHaveBeenCalledWith('record_pto_usage', expect.anything());
  });

  it('offers the choice of team member when several are given', async () => {
    withClient(<UsePtoDialog open onClose={vi.fn()} members={[{ employeeId: 'e1', displayName: 'Dore, Karen J' }, { employeeId: 'e2', displayName: 'Edge, Sophia' }]} />);
    expect(await screen.findByLabelText('Team member')).toBeTruthy();
  });
});

describe('PtoUsageEntry', () => {
  it('shows the hours, who recorded them, and a take-back only for a live entry of their own', () => {
    cleanup();
    const onVoid = vi.fn();
    render(<PtoUsageEntry entry={row({ hours: 2.5, note: 'appointment', source: 'manager' })} onVoid={onVoid} />);
    expect(screen.getByText('2.50h')).toBeTruthy();
    expect(screen.getByText(/Recorded by manager · appointment/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Take back/ }));
    expect(onVoid).toHaveBeenCalled();
  });
  it('strikes a taken-back entry and offers nothing', () => {
    cleanup();
    render(<PtoUsageEntry entry={row({ voided_at: '2026-10-06T00:00:00Z', void_reason: 'wrong day' })} />);
    expect(screen.getByText(/Taken back: wrong day/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
