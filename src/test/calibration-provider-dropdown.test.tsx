import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CalibrationWizard from '@/components/close-day/CalibrationWizard';
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (s: string) => void; children: React.ReactNode }) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: ({ children, ...props }: React.ComponentProps<'optgroup'>) => <optgroup {...props}>{children}</optgroup>,
  SelectValue: () => <option value="">Select</option>, SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
type Word = { text: string; confidence: number; bbox: { x0: number; x1: number; y0: number; y1: number } };
type TestProvider = { id: string; displayName: string; providerType: 'doctor' | 'hygienist'; employeeId: string | null; active: boolean; scheduleCode?: string | null };
const state = vi.hoisted(() => ({
  providers: [] as TestProvider[],
  words: [] as Word[],
  columns: [{ xStart: .1, xEnd: .6 }] as Array<{ xStart: number; xEnd: number }>,
}));
const saveProfile = vi.hoisted(() => vi.fn());
const updateProvider = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useProviders', () => ({ useProviders: () => ({ data: state.providers }), useUpdateProvider: () => ({ mutateAsync: updateProvider }) }));
vi.mock('@/hooks/usePracticeSettings', () => ({ usePracticeSettings: () => ({ data: { pms_system: 'dentrix' } }) }));
vi.mock('@/hooks/useProviderWorkingHours', () => ({ useProviderWorkingHours: () => ({ data: {
  hygiene: { periods: [{ weekday: 1, startMinutes: 450, endMinutes: 990 }], source: "Hygienist Test's work schedule in Team" },
} }) }));
vi.mock('@/hooks/useScheduleIntelligence', () => ({ useSaveLayoutProfile: () => ({ mutateAsync: saveProfile }), useLayoutProfiles: () => ({ data: [{ id: 'existing-profile', is_default: true, layout_signature: { columns: [] } }] }) }));
vi.mock('@/lib/schedule-reader/ocr', () => ({ terminateOcr: async () => {}, recognizeFrame: async () => ({ words: state.words }) }));
vi.mock('@/lib/schedule-reader', async original => ({
  ...await original<typeof import('@/lib/schedule-reader')>(),
  captureSupported: () => false,
  frameFromFile: async () => ({ canvas: document.createElement('canvas'), width: 100, height: 100, objectUrls: [], tracks: [] }),
  destroyCapture: async () => {},
  draftColumnsFromFrame: () => state.columns,
}));

const word = (text: string, x: number, y: number, confidence = 99): Word => ({ text, confidence, bbox: { x0: x, x1: x + 10, y0: y, y1: y + 5 } });
const openWithScreenshot = () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D);
  render(<CalibrationWizard open onClose={() => {}} />);
  fireEvent.change(screen.getByLabelText('Privacy-view schedule screenshot'), { target: { files: [new File([''], 'schedule.png', { type: 'image/png' })] } });
};

beforeEach(() => {
  saveProfile.mockReset(); updateProvider.mockReset();
  state.columns = [{ xStart: .1, xEnd: .6 }];
});

it('selects office providers, derives their type and department, and records the confirmed code', async () => {
  state.providers = [
    { id: 'doctor', displayName: 'Dr. Test', providerType: 'doctor', employeeId: 'e1', active: true },
    { id: 'hygiene', displayName: 'Hygienist Test', providerType: 'hygienist', employeeId: 'e2', active: true },
  ];
  state.words = [word('DR02', 20, 1)];
  openWithScreenshot();
  await waitFor(() => expect(screen.getByText(/DR02 read in 1 appointment, but no provider has this code yet\. Pick who DR02 is — saving the layout records it as their schedule code\./)).toBeInTheDocument());
  // The reader narrows without deciding: the only doctor without a code is a one-click pick, not a prefill.
  expect(screen.getByText('0 of 1 columns')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Use Dr. Test for column 1' })).toBeInTheDocument();
  expect(screen.getByText(/Likely — DR02 reads like a doctor code and Dr\. Test is the only doctor without a schedule code yet\./)).toBeInTheDocument();
  const select = screen.getByRole('option', { name: 'Dr. Test' }).closest('select')!;
  expect(screen.getByRole('button', { name: 'Next: working day' })).toBeDisabled();
  fireEvent.change(select, { target: { value: 'doctor' } });
  expect(screen.getByText('Dentist')).toBeInTheDocument();
  expect(screen.getByText('Doctor')).toBeInTheDocument();
  expect(screen.getByText('Picked')).toBeInTheDocument();
  expect(screen.getByText("Saving also records DR02 as Dr. Test's schedule code in Settings → Office → Providers, so every future capture knows the code on sight.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next: working day' })).toBeEnabled();
  fireEvent.change(select, { target: { value: 'hygiene' } });
  expect(screen.getByText('Hygienist')).toBeInTheDocument();
  expect(screen.getByText('Hygiene')).toBeInTheDocument();
  // A DR code on a hygienist is the closer's call, but it is worth a second look.
  expect(screen.getByText(/DR02 as Hygienist Test's schedule code \(DR codes usually belong to a doctor — double-check this pick\)/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next: working day' }));
  expect(screen.queryByRole('button', { name: 'Completed' })).not.toBeInTheDocument();
  // What the office already knows is filled in: the hygienist's saved work
  // schedule, and a working day taken from it — nothing asked for twice.
  expect(screen.getByLabelText('Review weekly hours')).toHaveValue('Monday,07:30,16:30');
  expect(screen.getByText(/Filled from Hygienist Test's work schedule in Team/)).toBeInTheDocument();
  expect(screen.getByLabelText('Day starts')).toHaveValue('07:30');
  expect(screen.getByLabelText('Day ends')).toHaveValue('16:30');
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
      columns: [expect.objectContaining({ providerId: 'hygiene', providerCode: 'DR02', workingHours: [{ weekday: 1, startMinutes: 450, endMinutes: 990 }] })],
    }),
    statusLegend: [],
  })));
  // Review-only evidence never reaches the saved layout.
  expect(saveProfile.mock.calls[0][0].signature.columns[0]).not.toHaveProperty('suggestion');
  await waitFor(() => expect(updateProvider).toHaveBeenCalledWith({ id: 'hygiene', scheduleCode: 'DR02' }));
});

it('prefills a column from a registry code with its reason, offers the only unassigned doctor for an unowned code, and records only new codes', async () => {
  state.providers = [
    { id: 'scott', displayName: 'Dr. Scott', providerType: 'doctor', employeeId: null, active: true },
    { id: 'molly', displayName: 'Molly', providerType: 'hygienist', employeeId: null, active: true, scheduleCode: 'HY16' },
    { id: 'cori', displayName: 'Cori', providerType: 'hygienist', employeeId: null, active: true },
  ];
  state.columns = [{ xStart: .1, xEnd: .4 }, { xStart: .5, xEnd: .9 }];
  // Lane 1: Molly's code three times, one of them the G-for-6 OCR slip. Lane 2: DR02 twice, nobody's code yet.
  state.words = [word('HY16', 15, 30, 90), word('HY1G', 15, 50, 70), word('HY16', 15, 70, 90), word('DRO2', 60, 30, 70), word('DR02', 60, 60, 70)];
  openWithScreenshot();
  await waitFor(() => expect(screen.getByText("HY16 read in 3 appointments. Suggested because HY16 is Molly's schedule code.")).toBeInTheDocument());
  expect(screen.getByText('Suggested — confirm')).toBeInTheDocument();
  expect(screen.getByText('1 of 2 columns')).toBeInTheDocument();
  expect(screen.getByText(/Not placed in any column yet: Dr\. Scott, Cori\./)).toBeInTheDocument();
  expect(screen.getByText(/DR02 read in 2 appointments, but no provider has this code yet/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next: working day' })).toBeDisabled();
  // Nothing is recorded for a code the registry already knows.
  expect(screen.queryByText(/Saving also records/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use Dr. Scott for column 2' }));
  expect(screen.getByText('2 of 2 columns')).toBeInTheDocument();
  expect(screen.getByText(/Not placed in any column yet: Cori\./)).toBeInTheDocument();
  expect(screen.getByText("Saving also records DR02 as Dr. Scott's schedule code in Settings → Office → Providers, so every future capture knows the code on sight.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next: working day' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save layout profile' }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
    signature: expect.objectContaining({ columns: [
      expect.objectContaining({ providerId: 'molly', providerCode: 'HY16', providerRole: 'hygienist' }),
      expect.objectContaining({ providerId: 'scott', providerCode: 'DR02', providerRole: 'dentist' }),
    ] }),
  })));
  await waitFor(() => expect(updateProvider).toHaveBeenCalledTimes(1));
  expect(updateProvider).toHaveBeenCalledWith({ id: 'scott', scheduleCode: 'DR02' });
});
