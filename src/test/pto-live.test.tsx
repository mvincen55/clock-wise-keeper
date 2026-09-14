import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { getTierForDate } from '@/hooks/usePtoEngine';
import { PtoUsageRow } from '@/pages/PTO';

describe('PTO employment tenure', () => {
  it('uses calendar anniversaries exactly', () => {
    expect(getTierForDate('2022-12-23', '2026-09-14').rate).toBe(.0769);
    expect(getTierForDate('2022-12-23', '2023-12-22').rate).toBe(.0576);
    expect(getTierForDate('2022-12-23', '2023-12-23').rate).toBe(.0769);
    expect(getTierForDate('2022-12-23', '2027-12-23').rate).toBe(.0962);
    expect(getTierForDate('2022-12-23', '2033-12-23').rate).toBe(.1009);
  });
});
describe('Recorded PTO usage', () => {
  const entry={id:'day',date_start:'2026-08-31',date_end:'2026-08-31',type:'unscheduled',notes:null};
  it.each([[null,'Hours not recorded'],[0,'0h'],[2.5,'2.5h']])('renders %s without assuming a full day', (hours,label) => {
    cleanup();
    render(<PtoUsageRow entry={{...entry,hours}} onUpdateHours={vi.fn()}/>);
    expect(screen.getByRole('button',{name:String(label)})).toBeTruthy();
    expect(screen.queryByText('8h')).toBeNull();
  });
  it('saves actual zero hours instead of a fallback', () => {
    cleanup();const update=vi.fn();
    render(<PtoUsageRow entry={{...entry,hours:null}} onUpdateHours={update}/>);
    fireEvent.click(screen.getByRole('button',{name:'Hours not recorded'}));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'0'}});
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    expect(update).toHaveBeenCalledWith('day',0);
  });
});
