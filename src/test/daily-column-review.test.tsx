import React from 'react';
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DailyColumnReview from '@/components/close-day/DailyColumnReview';
import type { CaptureFrame, LayoutColumn } from '@/lib/schedule-reader';
import type { Provider } from '@/lib/providers';
import type { ReviewColumn } from '@/lib/schedule-provider-mapping';
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

it('lets a closer exclude and restore an extra lane without assigning a fake provider',()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn(),strokeRect:vi.fn(),fillRect:vi.fn(),fillText:vi.fn()} as unknown as CanvasRenderingContext2D);
 const known:LayoutColumn={xStart:0,xEnd:.4,kind:'provider',providerId:'p',providerLabel:'Dr. Example',providerRole:'dentist',department:'doctor',employeeId:null};
 const extra:LayoutColumn={...known,xStart:.5,xEnd:.9,providerId:undefined,providerLabel:null};
 const onConfirm=vi.fn();
 render(<DailyColumnReview initial={[known,extra]} providers={[{id:'p',displayName:'Dr. Example',providerType:'doctor',employeeId:null,active:true,orgId:'o',sortOrder:0}]} frame={{width:100,height:100,canvas:document.createElement('canvas')} as CaptureFrame} date="2026-09-14" onConfirm={onConfirm} onCancel={()=>{}}/>);
 const confirm=screen.getByRole('button',{name:'Use these assignments'});
 expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Exclude column 2'}));
 expect(confirm).toBeEnabled();
 expect(screen.queryByRole('button',{name:'Exclude column 2'})).not.toBeInTheDocument();
 fireEvent.click(confirm);
 expect(onConfirm).toHaveBeenCalledWith([expect.objectContaining({providerId:'p'}),expect.objectContaining({kind:'non_clinical',providerId:undefined})]);
 fireEvent.click(screen.getByText('1 excluded columns (empty or notes only)'));
 fireEvent.click(screen.getByRole('button',{name:'Restore column 2'}));
 expect(confirm).toBeDisabled();
});

it('offers evidence-backed picks with their reason and strips the evidence before confirming', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() } as unknown as CanvasRenderingContext2D);
  const scott: Provider = { id: 'scott', displayName: 'Dr. Scott', providerType: 'doctor', employeeId: null, active: true, orgId: 'o', sortOrder: 0 };
  const col: ReviewColumn = {
    xStart: 0, xEnd: .5, kind: 'provider', providerLabel: null, providerRole: null, department: null, employeeId: null, providerCode: 'DR02',
    suggestion: { codes: [{ code: 'DR02', count: 3 }], candidates: [{ providerId: 'scott', strength: 'likely', reason: 'DR02 reads like a doctor code and Dr. Scott is the only doctor without a schedule code yet' }] },
  };
  const confirm = vi.fn();
  render(<DailyColumnReview initial={[col]} providers={[scott]} frame={{ width: 100, height: 100, canvas: document.createElement('canvas') } as CaptureFrame} date="2026-09-17" onConfirm={confirm} onCancel={() => {}} />);
  expect(screen.getByText('0 of 1 columns')).toBeInTheDocument();
  expect(screen.getByText(/DR02 read in 3 appointments, but no provider has this code yet\. Pick who DR02 is for today\./)).toBeInTheDocument();
  expect(screen.getByText(/Likely — DR02 reads like a doctor code/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use Dr. Scott for column 1' }));
  expect(screen.getByText('1 of 1 columns')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Use Dr. Scott for column 1' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use these assignments' }));
  expect(confirm).toHaveBeenCalledWith([expect.objectContaining({ providerId: 'scott', providerRole: 'dentist', providerCode: 'DR02' })]);
  expect(confirm.mock.calls[0][0][0]).not.toHaveProperty('suggestion');
});
