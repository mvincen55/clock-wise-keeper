import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import ReportsAnalyst from '@/components/accountability/ReportsAnalyst';

const mocks=vi.hoisted(()=>({invoke:vi.fn(),pdf:vi.fn()}));
vi.mock('@/hooks/useOrgContext',()=>({useOrgContext:()=>({data:{org_id:'office'}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('@/lib/analyst-pdf',()=>({buildAnalystPdf:mocks.pdf}));
const coverage={evidence_version:2,record_count:3,counts:[{key:'attendance',label:'Attendance days',count:2},{key:'checklist_completions',label:'Checklist completions',count:1},{key:'accountability',label:'Accountability reports',count:0}],warnings:[]};
function mount(employeeId?:string) {
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ReportsAnalyst from="2026-09-01" to="2026-09-15" kind="all" employeeId={employeeId}/></QueryClientProvider>);
}
beforeEach(()=>{mocks.invoke.mockReset();mocks.pdf.mockReset();});
afterEach(cleanup);
describe('expanded record analyst',()=>{
  it('shows loading rather than zero while sources are being fetched',()=>{
    mocks.invoke.mockReturnValue(new Promise(()=>{}));mount();
    expect(screen.queryByText('Analyze 0 records')).toBeNull();expect(screen.getByRole('button',{name:'Loading records…'})).toBeDisabled();
  });
  it('counts attendance and checklists when no formal reports exist, preserving employee scope and citations',async()=>{
    const citation={id:'time_entries:bbbbbb',source_id:'111111',source_table:'time_entries',who:'Megan',kind:'attendance',kind_label:'Attendance days',period_start:'2026-09-10',period_end:'2026-09-10',status:'work_recorded',summary:'Work minutes: 480.',member_reason:null,manager_note:null,closed_at:null};
    mocks.invoke.mockImplementation((_name,{body})=>Promise.resolve({data:body.action==='preview'?coverage:{...coverage,answer:'Work was recorded. [rec:time_entries:bbbbbb]',citations:[citation],concerns:[]},error:null}));
    mount('employee-one');
    fireEvent.click(await screen.findByRole('button',{name:'Analyze 3 records'}));
    await screen.findByText('Work was recorded.',{exact:false});
    expect(mocks.invoke).toHaveBeenCalledWith('reports-analyst',expect.objectContaining({body:expect.objectContaining({action:'analyze',source:'all',employee_id:'employee-one'})}));
    fireEvent.click(screen.getAllByRole('button',{name:/Megan/})[0]);
    expect(await screen.findByText('Work minutes: 480.')).toBeInTheDocument();
    expect(screen.getByText(/Source: time entries · Record 111111/)).toBeInTheDocument();
  });
  it('shows fetch failures as errors, never as an empty database',async()=>{
    mocks.invoke.mockResolvedValue({data:null,error:new Error('offline')});mount();
    await screen.findByRole('alert');expect(screen.queryByText('Analyze 0 records')).toBeNull();
    expect(screen.getByRole('button',{name:'Records unavailable'})).toBeDisabled();
  });
  it('disables analysis and quick questions when there is no matching evidence',async()=>{
    mocks.invoke.mockResolvedValue({data:{...coverage,record_count:0,counts:[]},error:null});mount();
    await waitFor(()=>expect(screen.getByRole('button',{name:'Analyze 0 records'})).toBeDisabled());
    expect(screen.getByRole('button',{name:'Attendance patterns'})).toBeDisabled();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
