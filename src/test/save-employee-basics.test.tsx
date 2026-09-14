import {renderHook,act,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,it,expect,vi} from 'vitest';
import {useSaveBasics} from '@/hooks/useOnboarding';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:'manager'}})}));
vi.mock('@/hooks/useOrgContext',()=>({useOrgContext:()=>({data:{org_id:'office',employee_id:'manager'}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
afterEach(()=>{cleanup();rpc.mockReset();});
function setup(){
 const client=new QueryClient({defaultOptions:{mutations:{retry:false}}});
 const invalidate=vi.spyOn(client,'invalidateQueries');
 const hook=renderHook(()=>useSaveBasics(),{wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
 return {...hook,invalidate};
}
it('saves a pending employee code through the authorized endpoint and refreshes the directory',async()=>{
 rpc.mockResolvedValue({data:{id:'pending',tag:'DA02'},error:null});
 const {result,invalidate}=setup();
 await act(async()=>{await result.current.mutateAsync({employeeId:'pending',tag:'da02'});});
 expect(rpc).toHaveBeenCalledWith('save_employee_basics',{p_employee_id:'pending',p_patch:{tag:'DA02'}});
 expect(invalidate).toHaveBeenCalledWith({queryKey:['org-staff']});
});
it('rejects a missing saved row instead of reporting success',async()=>{
 rpc.mockResolvedValue({data:null,error:null});const {result}=setup();
 await act(async()=>{await expect(result.current.mutateAsync({employeeId:'pending',tag:'DA02'})).rejects.toThrow('not saved');});
});
it('explains duplicate or retired codes',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'23505',message:'duplicate'}});const {result}=setup();
 await act(async()=>{await expect(result.current.mutateAsync({employeeId:'pending',tag:'DA02'})).rejects.toThrow('already taken');});
});

