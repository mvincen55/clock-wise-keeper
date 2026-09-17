import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { TardiesTable } from '@/components/TardiesTable';
import { TardyReviewModal } from '@/components/TardyReviewModal';
import type { TardyRow } from '@/hooks/useTardies';

afterEach(cleanup);

// Instants are real UTC; the office runs on America/New_York (EDT in September).
function tardy(over: Partial<TardyRow>): TardyRow {
  return {
    id: 'row', user_id: 'login', org_id: 'office', employee_id: 'emp', time_entry_id: null,
    entry_date: '2026-09-14', expected_start_time: '09:00:00', actual_start_time: '2026-09-14T14:29:00.000Z',
    minutes_late: 84, reason_text: null, approval_status: 'unreviewed', approved_by: null, approved_at: null,
    resolved: false, timezone_suspect: false, created_at: '', updated_at: '',
    ...over,
  };
}

const rows: TardyRow[] = [
  tardy({ id: 'wed', employee_id: 'sam', entry_date: '2026-09-16', expected_start_time: '09:45:00', actual_start_time: '2026-09-16T21:58:00.000Z', minutes_late: 488 }),
  tardy({ id: 'mon-sam', employee_id: 'sam', expected_start_time: '09:00:00', actual_start_time: '2026-09-14T14:29:00.000Z', minutes_late: 84 }),
  tardy({ id: 'mon-alex', employee_id: 'alex', expected_start_time: '08:20:00', actual_start_time: '2026-09-14T12:28:00.000Z', minutes_late: 3 }),
];
const names: Record<string, string> = { sam: 'Sam Rivera', alex: 'Alex Chen' };
const nameFor = (t: TardyRow) => names[t.employee_id] ?? '—';

function cells(row: HTMLElement) {
  return within(row).getAllByRole('cell').map(cell => cell.textContent?.trim());
}

describe('TardiesTable', () => {
  it('renders expected and actual times in the same style', () => {
    render(<TardiesTable rows={rows} canReview={false} onReview={() => {}} />);
    const body = screen.getAllByRole('rowgroup')[1];
    const [wed, monSam, monAlex] = within(body).getAllByRole('row');
    expect(cells(wed).slice(0, 4)).toEqual(['Wed, Sep 16, 2026', '9:45 AM', '5:58 PM', '488']);
    expect(cells(monSam).slice(0, 4)).toEqual(['Mon, Sep 14, 2026', '9:00 AM', '10:29 AM', '84']);
    expect(cells(monAlex).slice(0, 4)).toEqual(['Mon, Sep 14, 2026', '8:20 AM', '8:28 AM', '3']);
    expect(screen.queryByText('Employee')).toBeNull();
    expect(screen.getByText('575 min')).toBeTruthy();
  });

  it('names the employee on each row for managers, grouping a shared day by name', () => {
    const onReview = vi.fn();
    render(<TardiesTable rows={rows} employeeNameFor={nameFor} canReview onReview={onReview} />);
    expect(screen.getByRole('columnheader', { name: 'Employee' })).toBeTruthy();
    const body = screen.getAllByRole('rowgroup')[1];
    const shown = within(body).getAllByRole('row').map(r => cells(r).slice(0, 2));
    expect(shown).toEqual([
      ['Wed, Sep 16, 2026', 'Sam Rivera'],
      ['Mon, Sep 14, 2026', 'Alex Chen'],
      ['Mon, Sep 14, 2026', 'Sam Rivera'],
    ]);
    fireEvent.click(within(body).getAllByRole('button', { name: 'Review' })[1]);
    expect(onReview).toHaveBeenCalledWith(rows[2]);
  });

  it('leaves a punch whose time looks off out of the total', () => {
    const suspect = tardy({ id: 'odd', timezone_suspect: true, minutes_late: 90, entry_date: '2026-09-15' });
    render(<TardiesTable rows={[rows[2], suspect]} canReview={false} onReview={() => {}} />);
    expect(screen.getByText('⚠ Time Looks Off')).toBeTruthy();
    expect(screen.getByText('3 min')).toBeTruthy();
  });
});

describe('TardyReviewModal', () => {
  it('shows whose tardy it is and both times in the office timezone', () => {
    render(<TardyReviewModal open tardy={rows[0]} employeeName="Sam Rivera" onSubmit={async () => {}} onClose={() => {}} />);
    expect(screen.getByText('Review Tardy — Sam Rivera · Wed, Sep 16, 2026')).toBeTruthy();
    expect(screen.getByText('488 minutes late (Expected: 9:45 AM, Actual: 5:58 PM)')).toBeTruthy();
  });
});
