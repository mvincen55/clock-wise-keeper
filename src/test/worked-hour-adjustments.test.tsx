import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,it,expect,vi} from 'vitest';
import WorkedHourAdjustments,{adjustmentWeek} from '@/components/team/WorkedHourAdjustments';
import {AttendanceTab} from '@/components/TeamEmployeeCard';
vi.mock('@/hooks/useAttendanceFallback',()=>({useResolvedEmployeeAttendance:()=>({rows:[],isLoading:false})}));
const state=vi.hoisted(()=>({role:'manager',adjustments:[] as any[],rpc:vi.fn().mockResolvedValue({data:'saved',error:null})}));
vi.mock('@/hooks/useOrgContext',()=>({useOrgContext:()=>({data:{org_id:'office',role:state.role}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc,from:(table:string)=>{let start='',end='9999';const q:any={select:()=>q,eq:()=>q,gte:(_:string,v:string)=>{start=v;return q},lte:(_:string,v:string)=>{end=v;return q},order:()=>q,then:(resolve:any)=>Promise.resolve({data:table==='worked_hour_adjustments'?state.adjustments.filter(r=>r.entry_date>=start&&r.entry_date<=end):[],error:null}).then(resolve)};return q;}}}));
const clients:QueryClient[]=[];
function show(){const c=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(c);render(<QueryClientProvider client={c}><WorkedHourAdjustments employeeId="person"/></QueryClientProvider>);}
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());state.role='manager';state.adjustments=[];state.rpc.mockClear();});
describe('Worked-hour offsets',()=>{
 it('shows an adjustment only in its selected week even without attendance punches',async()=>{
  state.adjustments=[{id:'old',entry_date:'2026-08-01',hours_delta:6.99,reason:'Prior pay correction'}];
  const c=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(c);
  const view=render(<QueryClientProvider client={c}><AttendanceTab employeeId="person" range={{start:'2026-09-06',end:'2026-09-12'}}/></QueryClientProvider>);
  await screen.findByText('No attendance data for this date range.');
  expect(screen.queryByText('Prior pay correction')).toBeNull();
  view.rerender(<QueryClientProvider client={c}><AttendanceTab employeeId="person" range={{start:'2026-07-26',end:'2026-08-01'}}/></QueryClientProvider>);
  await screen.findByText('Prior pay correction');expect(screen.getByText('+6.99h')).toBeTruthy();
 });
 it('puts Saturday in its paid Sunday-Saturday week',()=>expect(adjustmentWeek('2026-07-18')).toEqual({start:'2026-07-12',end:'2026-07-18'}));
 it('does not offer an adjustment button to employees',()=>{state.role='employee';show();expect(screen.queryByRole('button',{name:'Offset hours'})).toBeNull();});
 it('requires a reason and submits signed hours for the selected paid date',async()=>{
  show();fireEvent.click(screen.getByRole('button',{name:'Offset hours'}));
  fireEvent.change(screen.getByLabelText('Date of adjustment'),{target:{value:'2026-08-01'}});
  fireEvent.change(screen.getByLabelText('Hours to add or subtract'),{target:{value:'6.99'}});
  fireEvent.click(screen.getByRole('button',{name:'Save adjustment'}));expect(state.rpc).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Reason (required)'),{target:{value:'Underpayment for May 18–22'}});
  fireEvent.click(screen.getByRole('button',{name:'Save adjustment'}));
  await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('add_worked_hour_adjustment',expect.objectContaining({p_employee_id:'person',p_entry_date:'2026-08-01',p_hours_delta:6.99,p_reason:'Underpayment for May 18–22'})));
 });
});

