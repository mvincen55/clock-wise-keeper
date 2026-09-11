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
vi.mock('@/hooks/useScheduleIntelligence', () => ({ useSaveLayoutProfile: () => ({ mutateAsync: vi.fn() }), useLayoutProfiles: () => ({ data: [] }) }));
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
  fireEvent.change(screen.getByLabelText('Privacy-view schedule screenshot'), { target: { files: [new File([''], 'schedule.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByText('Schedule ID: DR02')).toBeInTheDocument());
  const select = screen.getByRole('option', { name: 'Dr. Test' }).closest('select')!;
  expect(screen.getByRole('button', { name: 'Next: status colors' })).toBeDisabled();
  fireEvent.change(select, { target: { value: 'doctor' } });
  expect(screen.getByText('Dentist')).toBeInTheDocument();
  expect(screen.getByText('Doctor')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next: status colors' })).toBeEnabled();
  fireEvent.change(select, { target: { value: 'hygiene' } });
  expect(screen.getByText('Hygienist')).toBeInTheDocument();
  expect(screen.getByText('Hygiene')).toBeInTheDocument();
});

