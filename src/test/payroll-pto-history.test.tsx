import {render,screen,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,it,expect,vi} from 'vitest';
import PayrollPtoHistory from '@/components/team/PayrollPtoHistory';
vi.mock('@/hooks/useOrgContext',()=>({useOrgContext:()=>({data:{org_id:'office'}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{
 const q:any={select:()=>q,eq:()=>q,order:()=>Promise.resolve({data:[{id:'source',period_start:'2026-08-23',period_end:'2026-08-29',check_date:'2026-09-02',pto_hours:8,pto_ytd_hours:100,worked_hours:23.78,source_file:'payroll.pdf',source_page:29,review_note:'Earlier weeks are missing.',entered_by_label:'MV'}],error:null})};return q;
}}}));
afterEach(cleanup);
describe('Payroll PTO documentation',()=>{
 it('shows usage and entry attribution without source references',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<QueryClientProvider client={client}><PayrollPtoHistory employeeId="gina"/></QueryClientProvider>);
 await waitFor(()=>expect(screen.getByText('8.00h PTO used')).toBeTruthy());
 expect(screen.getByText(/PTO year to date: 100.00h/)).toBeTruthy();
 expect(screen.queryByText(/payroll.pdf/)).toBeNull();
 expect(screen.getByText('Entered by MV')).toBeTruthy();
 expect(screen.queryByText(/Earlier weeks are missing/)).toBeNull();
 expect(screen.getByText(/not deducted again/)).toBeTruthy();client.clear();
 });
});
