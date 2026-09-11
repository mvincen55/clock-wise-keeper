import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProviderWorkingSchedule from '@/components/close-day/ProviderWorkingSchedule';

it('requires review before attaching parsed hours and reports unsaved edits', async () => {
  const onChange = vi.fn(); const onPendingChange = vi.fn();
  render(<ProviderWorkingSchedule providerId="p1" name="Dr. Test" onChange={onChange} onPendingChange={onPendingChange} />);
  const file = new File(['Monday,08:00,17:00'], 'hours.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: async () => 'Dr. Test\nMonday,08:00,17:00' });
  fireEvent.change(screen.getByLabelText('Working schedule file for Dr. Test'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByLabelText('Review weekly hours')).toHaveValue('Monday,08:00,17:00'));
  expect(onChange).not.toHaveBeenCalled();
  expect(onPendingChange).toHaveBeenLastCalledWith('p1', true);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm working hours' }));
  expect(onChange).toHaveBeenCalledWith([{ weekday: 1, startMinutes: 480, endMinutes: 1020 }]);
});

it('does not replace confirmed hours with an invalid schedule', () => {
  const onChange = vi.fn();
  render(<ProviderWorkingSchedule providerId="p1" name="Dr. Test" value={[{ weekday: 1, startMinutes: 480, endMinutes: 1020 }]} onChange={onChange} onPendingChange={() => {}} />);
  fireEvent.change(screen.getByLabelText('Review weekly hours'), { target: { value: 'Monday,17:00,08:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm working hours' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Check the working hours');
  expect(onChange).not.toHaveBeenCalled();
});
