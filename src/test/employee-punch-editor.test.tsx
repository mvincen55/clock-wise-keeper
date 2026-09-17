import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import type { PunchRow } from '@/hooks/useTimeEntries';
import { easternDateKey, setAppTimezone } from '@/lib/time-utils';

const save = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/usePunchEditor', () => ({ useSavePunchEdits: () => ({ mutateAsync: save, isPending: false }) }));
vi.mock('@/hooks/useWorkSchedule', () => ({ useWorkSchedule: () => ({ data: [] }), getScheduleForWeekday: () => null }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

afterEach(cleanup);
beforeEach(() => { save.mockReset(); save.mockResolvedValue({ applied_ops: 1 }); setAppTimezone('America/New_York'); });
describe('employee punch corrections', () => {
  it('adds on the selected historical date and requires an audit reason before saving', async () => {
    render(<PunchEditorModal open onClose={() => {}} entryId={null} entryDate="2026-08-01" employeeId="target" punches={[]} allowScheduleQuickFixes={false} />);
    expect(screen.queryByRole('button', { name: /Scheduled End/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Set Out → Now/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Punch' }));
    fireEvent.change(screen.getByLabelText('Punch 1 time'), { target: { value: '' } });
    expect(screen.getByLabelText('Punch 1 time')).not.toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Edit Reason/), { target: { value: 'ok' } });
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Edit Reason/), { target: { value: 'Missed clock-in' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const input = save.mock.calls[0][0];
    expect(input.employeeId).toBe('target');
    expect(input.reason).toBe('Missed clock-in');
    expect(easternDateKey(input.edited[0].punch_time)).toBe('2026-08-01');
  });
  it('passes a removed punch as a void operation candidate with its original values', async () => {
    const punch = { id: 'p1', punch_type: 'in', punch_time: '2026-08-01T13:00:00Z', source: 'manual', voided_at: null } as PunchRow;
    render(<PunchEditorModal open onClose={() => {}} entryId="entry" entryDate="2026-08-01" employeeId="target" punches={[punch]} allowScheduleQuickFixes={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Void punch 1' }));
    fireEvent.change(screen.getByLabelText(/Edit Reason/), { target: { value: 'Incorrect punch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toMatchObject({ entryId: 'entry', original: [{ id: 'p1', punch_time: punch.punch_time }], edited: [{ id: 'p1', is_deleted: true }] });
  });
});
