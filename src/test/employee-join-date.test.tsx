import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EmployeeSetupCard from '@/components/team/EmployeeSetupCard';
const state=vi.hoisted(()=>({employee:{} as any,snapshots:[] as any[],saved:vi.fn()}));
vi.mock('@/hooks/useOrgContext',()=>({useOrgContext:()=>({data:{org_id:'office'}})}));
vi.mock('@/hooks/usePtoEngine',()=>({useOrgPtoPolicy:()=>({data:{org_id:'office',worked_hours_cap_weekly:40,max_balance:100,allow_negative:false,updated_by:null,updated_at:''}})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 let update:any;
 const q:any={select:()=>q,eq:()=>q,order:()=>q,
  single:()=>Promise.resolve({data:state.employee,error:null}),
  maybeSingle:()=>Promise.resolve({data:{worked_hours_cap_weekly:40,max_balance:100},error:null}),
  update:(value:any)=>{update=value;return q;},
  upsert:(value:any)=>{if(table==='pto_snapshots'){state.saved(value);state.snapshots=state.snapshots.filter(s=>s.snapshot_date!==value.snapshot_date).concat(value);}return Promise.resolve({error:null});},
  then:(resolve:any)=>{if(update)state.employee={...state.employee,...update};return resolve({data:table==='pto_snapshots'?[...state.snapshots].sort((a,b)=>b.snapshot_date.localeCompare(a.snapshot_date)):state.employee,error:null});}};
 return q;
}}}));
afterEach(cleanup);
beforeEach(()=>{state.employee={id:'jill',org_id:'office',user_id:'login',hire_date:'2026-06-07',real_hire_date:'2022-12-23'};state.snapshots=[{snapshot_date:'2026-08-11',snapshot_balance_hours:99},{snapshot_date:'2026-06-07',snapshot_balance_hours:4.61}];state.saved.mockClear();});
describe('Purple Envelope join date and starting balance',()=>{
 it('loads the saved join-date balance instead of a later duplicate and keeps it after saving',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><EmployeeSetupCard employeeId="jill"/></QueryClientProvider>);
  await waitFor(()=>expect((screen.getByLabelText('PTO balance on join date (hours)') as HTMLInputElement).value).toBe('4.61'));
  expect(screen.queryByLabelText('Confirmed PTO balance date')).toBeNull();
  expect((screen.getByLabelText('Purple Envelope join date') as HTMLInputElement).value).toBe('2026-06-07');
  fireEvent.click(screen.getByRole('button',{name:'Save dates and PTO settings'}));
  await waitFor(()=>expect(state.saved).toHaveBeenCalledWith(expect.objectContaining({snapshot_date:'2026-06-07',snapshot_balance_hours:4.61})));
  await waitFor(()=>expect((screen.getByLabelText('PTO balance on join date (hours)') as HTMLInputElement).value).toBe('4.61'));
  client.clear();
 });
 it('uses a changed join date for the balance and preserves zero',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><EmployeeSetupCard employeeId="jill"/></QueryClientProvider>);
  await screen.findByLabelText('Purple Envelope join date');
  fireEvent.change(screen.getByLabelText('Purple Envelope join date'),{target:{value:'2026-06-01'}});
  fireEvent.change(screen.getByLabelText('PTO balance on join date (hours)'),{target:{value:'0'}});
  fireEvent.click(screen.getByRole('button',{name:'Save dates and PTO settings'}));
  await waitFor(()=>expect(state.saved).toHaveBeenCalledWith(expect.objectContaining({snapshot_date:'2026-06-01',snapshot_balance_hours:0})));
  await waitFor(()=>expect((screen.getByLabelText('Purple Envelope join date') as HTMLInputElement).value).toBe('2026-06-01'));
  client.clear();
 });
});
