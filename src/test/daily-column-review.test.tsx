import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DailyColumnReview from '@/components/close-day/DailyColumnReview';
import type { CaptureFrame, LayoutColumn } from '@/lib/schedule-reader';
import type { Provider } from '@/lib/providers';
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (s: string) => void; children: React.ReactNode }) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: ({ children, ...props }: React.ComponentProps<'optgroup'>) => <optgroup {...props}>{children}</optgroup>,
  SelectValue: () => <option value="">Select</option>, SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => <option value={value}>{children}</option>,
}));

it('requires a daily choice, confirms notes only, and clears its preview', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D);
  const col: LayoutColumn = { xStart: 0, xEnd: 1, kind: 'provider', providerLabel: null, providerRole: null, department: null, employeeId: null };
  const provider: Provider = { id: 'p', displayName: 'Dr. Example', providerType: 'doctor', employeeId: null, active: true, orgId: 'o', sortOrder: 0 };
  const confirm = vi.fn(); const cancel = vi.fn();
  const { unmount } = render(<DailyColumnReview initial={[col, col]} providers={[provider]} frame={{ width: 100, height: 100, canvas: document.createElement('canvas') } as CaptureFrame} date="2026-06-08" onConfirm={confirm} onCancel={cancel} />);
  const button = screen.getByRole('button', { name: 'Use these assignments' });
  expect(button).toBeDisabled();
  const selects = screen.getAllByRole('option', { name: 'Dr. Example' }).map(o => o.closest('select')!);
  fireEvent.change(selects[0], { target: { value: 'p' } });
  expect(button).toBeDisabled();
  fireEvent.change(selects[1], { target: { value: 'notes' } });
  fireEvent.click(button);
  expect(confirm).toHaveBeenCalledWith([expect.objectContaining({ providerId: 'p', providerRole: 'dentist' }), expect.objectContaining({ kind: 'non_clinical', providerLabel: null })]);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel capture' }));
  expect(cancel).toHaveBeenCalledOnce();
  const canvas = screen.getByLabelText('Current schedule with numbered column boundaries') as HTMLCanvasElement;
  unmount(); expect(canvas.width).toBe(0);
});
