/**
 * Management → Missed appointments: managers see the postings summarised by
 * month and provider; the import dialog previews a paste, maps providers to
 * the registry, and records rows that carry nothing about a patient;
 * employees are sent home. Reached from Management's grid.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import MissedAppointments from '@/pages/MissedAppointments';
import type { MissedAppointmentEvent } from '@/lib/missed-appointments';

const state = vi.hoisted(() => ({
  role: 'manager' as string,
  importRows: vi.fn().mockResolvedValue(3),
  events: [] as unknown[],
}));

const ev = (over: Partial<MissedAppointmentEvent>): MissedAppointmentEvent => ({
  id: `id-${Math.random().toString(36).slice(2)}`, org_id: 'office', business_date: '2026-09-08', code: '9100', provider_name: 'Lucia',
  provider_id: 'lucia', department: 'hygiene', primary_provider_code: null, ordinal: 1, source: 'dentrix_import', imported_by: 'megan',
  created_at: '', updated_at: '', ...over,
});

state.events = [
  ev({ id: 'a' }),
  ev({ id: 'b', code: '9101', provider_name: 'Dr. Scott', provider_id: 'scott', department: 'doctor', primary_provider_code: 'DR02' }),
  ev({ id: 'c', business_date: '2026-08-19', code: '9101', provider_name: 'Molly', provider_id: 'molly' }),
];

vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'emp-megan', user_id: 'megan', role: state.role, org_name: 'Office' }, isLoading: false }),
}));
vi.mock('@/hooks/useProviders', () => ({
  useProviders: () => ({ data: [
    { id: 'scott', orgId: 'office', displayName: 'Dr. Scott', providerType: 'doctor', scheduleCode: 'DR02', employeeId: null, active: true, sortOrder: 1 },
    { id: 'lucia', orgId: 'office', displayName: 'Lucia', providerType: 'hygienist', scheduleCode: 'HY10', employeeId: null, active: true, sortOrder: 2 },
    { id: 'molly', orgId: 'office', displayName: 'Molly', providerType: 'hygienist', scheduleCode: 'HY16', employeeId: null, active: true, sortOrder: 3 },
  ] }),
}));
vi.mock('@/hooks/useMissedAppointmentEvents', () => ({
  useMissedAppointmentEvents: () => ({ data: state.events, isLoading: false }),
  useImportMissedAppointmentEvents: () => ({ mutateAsync: state.importRows, isPending: false }),
  useDeleteMissedAppointmentEvent: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/lib/time-utils', async (orig) => ({ ...(await orig<typeof import('@/lib/time-utils')>()), getToday: () => '2026-09-21' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/management/missed-appointments']}>
      <Routes>
        <Route path="/management/missed-appointments" element={<MissedAppointments />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => { cleanup(); state.role = 'manager'; state.importRows.mockClear(); });

describe('Missed appointments page', () => {
  it('summarises the postings by month and provider for a manager', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /missed appointments/i })).toBeInTheDocument();
    const byMonth = screen.getByText('By month').closest('div')!.parentElement!;
    expect(within(byMonth).getByText('Sep 2026')).toBeInTheDocument();
    expect(within(byMonth).getByText('Aug 2026')).toBeInTheDocument();
    const byProvider = screen.getByText('By provider').closest('div')!.parentElement!;
    expect(within(byProvider).getByText('Lucia')).toBeInTheDocument();
    expect(within(byProvider).getByText('Dr. Scott')).toBeInTheDocument();
    // Totals: 3 postings, 1 no-show, 2 late cancellations, doctor/hygiene 1/2.
    expect(screen.getByText('Postings').nextElementSibling).toHaveTextContent('3');
    expect(screen.getByText('No-shows (9100)').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Late cancellations (9101)').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('By department').nextElementSibling).toHaveTextContent('1 / 2');
    // Every posting is listed with its primary provider when known.
    expect(screen.getByText('DR02')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove late cancellation for dr\. scott on 2026-09-08/i })).toBeInTheDocument();
  });

  it('sends an employee home', () => {
    state.role = 'employee';
    renderPage();
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('previews a pasted export, drops the patient column, maps providers, and records only the new postings', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /import from dentrix/i }));
    const textarea = await screen.findByLabelText('Pasted Dentrix text');
    fireEvent.change(textarea, { target: { value: [
      'Appt_Date\tAppt_Provider\tPatID\tProvID',
      '9/8/2026\tLucia Bizarro\t16330\tDR02',      // already recorded (Lucia, 9100, 9/8, ordinal 1)
      '9/8/2026\tLucia Bizarro\t16331\tDR05',      // the second posting that day is new
      '9/10/2026\tScott L. Harelick\t13943\tDR02',
      '9/11/2026\tHolli Braga\t14621\tDR02',
    ].join('\n') } });

    const preview = screen.getByTestId('missed-import-preview');
    expect(preview).toHaveTextContent('4 postings on 3 days read from 5 lines of an appointment export');
    expect(preview).toHaveTextContent('Dropped and never recorded: PatID.');
    expect(preview).toHaveTextContent('3 new (3 no-shows, 0 late cancellations) · 1 already recorded');
    expect(screen.getByText(/Holli Braga: not in the provider registry/)).toBeInTheDocument();
    // The mapping rows show Dentrix's label with its count.
    expect(screen.getByText('Lucia Bizarro').nextElementSibling).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: /record 3 postings/i }));
    await waitFor(() => expect(state.importRows).toHaveBeenCalledTimes(1));
    const rows = state.importRows.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows.map(r => [r.business_date, r.code, r.provider_name, r.provider_id, r.department, r.ordinal, r.primary_provider_code])).toEqual([
      ['2026-09-08', '9100', 'Lucia', 'lucia', 'hygiene', 2, 'DR05'],
      ['2026-09-10', '9100', 'Dr. Scott', 'scott', 'doctor', 1, 'DR02'],
      ['2026-09-11', '9100', 'Holli Braga', null, 'other', 1, 'DR02'],
    ]);
    const serialized = JSON.stringify(rows);
    for (const patientId of ['16330', '16331', '13943', '14621']) expect(serialized).not.toContain(patientId);
    expect(rows.every(r => r.imported_by === 'megan' && r.org_id === 'office' && r.source === 'dentrix_import')).toBe(true);
  });

  it('reads codes off a day sheet and, by default, only fills days with nothing recorded', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /import from dentrix/i }));
    const textarea = await screen.findByLabelText('Pasted Dentrix text');
    fireEvent.change(textarea, { target: { value: [
      'DAY SHEET (ALPHABETICAL)',
      '09/08/2026 | 09/08/2026 Someone, New | 9101 | CANCELLATION W/OUT NOTICE | 75.00 | 1 | HY16 (508)555-0100',
      '09/14/2026 | 09/14/2026 Someone, Else | 9100 | NO SHOW | 75.00 | 1 | HY10 ( | )',
      '09/15/2026 | 09/15/2026 Someone, Third | 9101 | CANCELLATION W/OUT NOTICE | 0.00 | 1 | DR02 (508)555-0101',
    ].join('\n') } });
    const preview = screen.getByTestId('missed-import-preview');
    expect(preview).toHaveTextContent('3 postings on 3 days read from 4 lines of a day sheet');
    expect(preview).toHaveTextContent('2 new (1 no-show, 1 late cancellation) · 1 skipped on 1 day already recorded');
    expect(screen.getByText('A day sheet says which code each line is.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /only add days with nothing recorded yet/i })).toBeChecked();
    // What the dialog shows about the paste is the count, the codes, and the provider IDs; never a name off the sheet.
    expect(preview).not.toHaveTextContent('Someone');
    const dialog = screen.getByRole('dialog');
    for (const id of ['HY16', 'HY10', 'DR02']) expect(within(dialog).getByText(id)).toBeInTheDocument();
    expect(screen.queryByText(/Someone, (New|Else|Third)/)).toBeNull();

    // Turning the switch off brings the 9/8 posting back in.
    fireEvent.click(screen.getByRole('switch', { name: /only add days with nothing recorded yet/i }));
    expect(preview).toHaveTextContent('3 new (1 no-show, 2 late cancellations)');

    fireEvent.click(screen.getByRole('button', { name: /record 3 postings/i }));
    await waitFor(() => expect(state.importRows).toHaveBeenCalledTimes(1));
    const rows = state.importRows.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows.map(r => [r.business_date, r.code, r.provider_name])).toEqual([
      ['2026-09-08', '9101', 'Molly'], ['2026-09-14', '9100', 'Lucia'], ['2026-09-15', '9101', 'Dr. Scott'],
    ]);
  });
});

describe('Missed appointments lives under Management', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
  it('is routed and linked from the Management grid', () => {
    expect(read('App.tsx')).toMatch(/path="\/management\/missed-appointments"/);
    expect(read('pages/Management.tsx')).toContain("to: '/management/missed-appointments'");
  });
});
