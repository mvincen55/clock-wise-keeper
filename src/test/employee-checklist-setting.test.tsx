import {render,renderHook,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,describe,it,expect,vi} from 'vitest';
import EmployeeChecklistSetting from '@/components/team/EmployeeChecklistSetting';
import {useChecklistGating} from '@/hooks/useChecklistGating';
import {useUnresolvedBypasses} from '@/hooks/useChecklistBypasses';
const state=vi.hoisted(()=>({role:'manager',required:true,rpc:vi.fn().mockResolvedValue({error:null}),from:vi.fn()}));
vi.mock('@/hooks/useOrgContext',()=>({useOrgContext:()=>({data:{org_id:'office',employee_id:'person',role:state.role}})}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'user'}})}));
vi.mock('@/hooks/usePracticeSettings',()=>({useClocksIn:()=>true}));
vi.mock('@/hooks/useEmployeeChecklistRequirement',()=>({useEmployeeChecklistRequirement:()=>({data:state.required,isSuccess:true,isLoading:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:state.rpc,from:state.from}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
const clients:QueryClient[]=[];
function wrapper({children}:{children:React.ReactNode}){const c=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(c);return <QueryClientProvider client={c}>{children}</QueryClientProvider>;}
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());state.role='manager';state.required=true;state.rpc.mockClear();state.from.mockReset();});
describe('Per-person checklist requirement',()=>{
 it('lets a manager turn off the requirement for the selected employee',async()=>{render(<EmployeeChecklistSetting employeeId="person"/>,{wrapper});fireEvent.click(screen.getByRole('switch',{name:'Checklist bypass required'}));await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith('set_employee_checklist_requirement',{p_employee_id:'person',p_required:false}));});
 it('does not let an employee change their own setting',()=>{state.role='employee';render(<EmployeeChecklistSetting employeeId="person"/>,{wrapper});expect(screen.queryByRole('switch')).toBeNull();});
 it('skips checklist queries and clock-out gating for an exempt employee',async()=>{state.required=false;const {result}=renderHook(()=>useChecklistGating(),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));expect(result.current.data?.incompleteCount).toBe(0);expect(state.from).not.toHaveBeenCalled();});
 it('hides unanswered-bypass reminders while exempt without deleting history',async()=>{state.required=false;const {result}=renderHook(()=>useUnresolvedBypasses(),{wrapper});await waitFor(()=>expect(result.current.isSuccess).toBe(true));expect(result.current.data).toEqual([]);expect(state.from).not.toHaveBeenCalled();});
});
