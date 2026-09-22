import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CalibrationWizard from '@/components/close-day/CalibrationWizard';
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (s: string) => void; children: React.ReactNode }) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: ({ children, ...props }: React.ComponentProps<'optgroup'>) => <optgroup {...props}>{children}</optgroup>,
  SelectValue: () => <option value="">Select</option>, SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
vi.mock('@/hooks/useProviders', () => ({ useProviders: () => ({ data: [
  { id: 'doctor', displayName: 'Dr. Test', providerType: 'doctor', employeeId: 'e1', active: true },
  { id: 'hygiene', displayName: 'Hygienist Test', providerType: 'hygienist', employeeId: 'e2', active: true },
] }) }));
vi.mock('@/hooks/usePracticeSettings', () => ({ usePracticeSettings: () => ({ data: { pms_system: 'dentrix' } }) }));
vi.mock('@/hooks/useProviderWorkingHours', () => ({ useProviderWorkingHours: () => ({ data: {
  hygiene: { periods: [{ weekday: 1, startMinutes: 450, endMinutes: 990 }], source: "Hygienist Test's work schedule in Team" },
} }) }));
const saveProfile = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useScheduleIntelligence', () => ({ useSaveLayoutProfile: () => ({ mutateAsync: saveProfile }), useLayoutProfiles: () => ({ data: [{ id: 'existing-profile', is_default: true, layout_signature: { columns: [] } }] }) }));
vi.mock('@/lib/schedule-reader/ocr', () => ({ terminateOcr: async () => {}, recognizeFrame: async () => ({ words: [{ text: 'DR02', confidence: 99, bbox: { x0: 20, x1: 40, y0: 1, y1: 5 } }] }) }));
vi.mock('@/lib/schedule-reader', async original => ({
  ...await original<typeof import('@/lib/schedule-reader')>(),
  captureSupported: () => false,
  frameFromFile: async () => ({ canvas: document.createElement('canvas'), width: 100, height: 100, objectUrls: [], tracks: [] }),
  destroyCapture: async () => {},
  draftColumnsFromFrame: () => [{ xStart: .1, xEnd: .6 }],
}));
it('selects office providers and derives their type and department', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  render(<CalibrationWizard open onClose={() => {}} />);
  // The practice software is shown, not asked, once Practice settings has it.
  expect(screen.getByText('Dentrix')).toBeInTheDocument();
  expect(document.querySelector('select')).toBeNull();
  fireEvent.change(screen.getByLabelText('Privacy-view schedule screenshot'), { target: { files: [new File([''], 'schedule.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByText('Schedule ID: DR02')).toBeInTheDocument());
  const select = screen.getByRole('option', { name: 'Dr. Test' }).closest('select')!;
  expect(screen.getByRole('button', { name: 'Next: review and save' })).toBeDisabled();
  fireEvent.change(select, { target: { value: 'doctor' } });
  expect(screen.getByText('Dentist')).toBeInTheDocument();
  expect(screen.getByText('Doctor')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next: review and save' })).toBeEnabled();
  fireEvent.change(select, { target: { value: 'hygiene' } });
  expect(screen.getByText('Hygienist')).toBeInTheDocument();
  expect(screen.getByText('Hygiene')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next: review and save' }));
  expect(screen.queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();
  // The last step is a glance, not a form: what the office already knows is
  // summarized — the hygienist's saved work schedule and a working day taken
  // from it — and Save is ready without touching anything.
  expect(screen.getByText('Working day 7:30 AM – 4:30 PM')).toBeInTheDocument();
  expect(screen.getByText('Mon 7:30 AM–4:30 PM')).toBeInTheDocument();
  expect(screen.getByText(/Filled from Hygienist Test's work schedule in Team/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Review weekly hours')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Confirm working hours' })).toBeNull();
  expect(screen.queryByText(/lunch and admin blocks/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Save layout profile' })).toBeEnabled();
  // The fields are still there for the office that needs them — behind Adjust.
  fireEvent.click(screen.getByRole('button', { name: 'Adjust the working day or hours' }));
  expect(screen.getByLabelText('Review weekly hours')).toHaveValue('Monday,07:30,16:30');
  expect(screen.getByLabelText('Day starts')).toHaveValue('07:30');
  expect(screen.getByLabelText('Day ends')).toHaveValue('16:30');
  expect(screen.queryByRole('button', { name: 'Confirm working hours' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Save layout profile' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Save layout profile' }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
    id: 'existing-profile',
    name: 'Dentrix',
    pmsName: 'Dentrix',
    signature: expect.objectContaining({
      captureMode: 'posted',
      cancelledRemainVisible: false,
      timeGrid: expect.objectContaining({ dayStartMinutes: 450, dayEndMinutes: 990 }),
      columns: [expect.objectContaining({ providerId: 'hygiene', workingHours: [{ weekday: 1, startMinutes: 450, endMinutes: 990 }] })],
    }),
    statusLegend: [],
  })));

});

