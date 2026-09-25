/**
 * The destinations Home links into actually read the parameters it sends:
 * Missed appointments seeds its range from ?start=&end=, and Report history
 * opens the package covering ?start=&end= on ?tab= with its daily rows
 * narrowed to the range and a way to widen them again.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { REPORT_SCHEMA } from '@/lib/prepared-report';

vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({ data: { org_id: 'office-a', employee_id: 'e1', user_id: 'u1', role: 'manager', org_name: 'Sample Family Dental' }, isLoading: false }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'manager@example.test' } }) }));
vi.mock('@/hooks/useProviders', () => ({ useProviders: () => ({ data: [] }) }));
vi.mock('@/hooks/useMissedAppointmentEvents', () => ({
  useMissedAppointmentEvents: () => ({ data: [], isLoading: false }),
  useDeleteMissedAppointmentEvent: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/components/missed-appointments/MissedAppointmentImportDialog', () => ({ MissedAppointmentImportDialog: () => null }));

const pkg = (id: string, start: string, end: string, dates: string[]) => ({
  id, report_start: start, report_end: end, imported_at: '2026-02-01T00:00:00Z',
  payload: {
    schema_version: REPORT_SCHEMA, target_org_id: 'office-a', report_start: start, report_end: end,
    sources: [{ name: 'Fixture', pages: '1', report_start: start, report_end: end }], definitions: {}, validation: {},
    source_control_totals: { posted_charges_cents: 100 * dates.length, recorded_payments_cents: 50 * dates.length, credit_adjustments_cents: 0, charge_adjustments_cents: 0, payroll_reported_minutes: 0, new_patients_of_record: 0 },
    daily_financials_by_entry_date: dates.map(date => ({ date, posted_charges_cents: 100, recorded_payments_cents: 50, credit_adjustments_cents: 0, charge_adjustments_cents: 0 })),
    monthly_financials_by_entry_date: [], daily_receipts_by_type: [], provider_period_controls: [], provider_daily_financials_by_entry_date: [],
    procedure_monthly_counts_by_entry_date: [], transaction_type_totals: [], staff_reported_hours: [], staff_daily_punches: [], pay_rates: [], calendar_events: [],
  },
});
vi.mock('@/hooks/usePracticeReportImports', () => ({
  usePracticeReportImports: () => ({
    data: [pkg('feb', '2026-02-01', '2026-02-28', ['2026-02-03', '2026-02-04']), pkg('jan', '2026-01-01', '2026-01-31', ['2026-01-05', '2026-01-06', '2026-01-20'])],
    isLoading: false, error: null,
  }),
}));

const withRouter = (path: string, ui: React.ReactElement, route: string) => (
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={route} element={ui} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>
);

describe('Missed appointments', () => {
  it('seeds its range from the query and falls back to the default for anything else', async () => {
    const { default: MissedAppointments } = await import('@/pages/MissedAppointments');
    render(withRouter('/management/missed-appointments?start=2026-01-01&end=2026-01-31', <MissedAppointments />, '/management/missed-appointments'));
    expect(screen.getByLabelText('Start')).toHaveValue('2026-01-01');
    expect(screen.getByLabelText('End')).toHaveValue('2026-01-31');
  });
  it('ignores a range that is not two dates in order', async () => {
    const { default: MissedAppointments } = await import('@/pages/MissedAppointments');
    render(withRouter('/management/missed-appointments?start=2026-02-10&end=2026-01-01', <MissedAppointments />, '/management/missed-appointments'));
    expect(screen.getByLabelText('Start')).not.toHaveValue('2026-02-10');
  });
});

describe('Report history', () => {
  it('opens the package covering the range on the requested tab, narrowed to the range, with a way to widen it', async () => {
    const { default: ReportHistory } = await import('@/pages/ReportHistory');
    render(withRouter('/report-history?start=2026-01-05&end=2026-01-11&tab=daily', <ReportHistory />, '/report-history'));
    expect(screen.getByLabelText('Report period')).toHaveValue('jan');
    expect(screen.getByRole('tab', { name: 'Daily', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Showing 2026-01-05 through 2026-01-11')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 rows')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole package' }));
    expect(screen.getByText('3 of 3 rows')).toBeInTheDocument();
  });
  it('without a range it opens the newest package on the overview', async () => {
    const { default: ReportHistory } = await import('@/pages/ReportHistory');
    render(withRouter('/report-history', <ReportHistory />, '/report-history'));
    expect(screen.getByLabelText('Report period')).toHaveValue('feb');
    expect(screen.getByRole('tab', { name: 'Monthly', selected: true })).toBeInTheDocument();
  });
});
