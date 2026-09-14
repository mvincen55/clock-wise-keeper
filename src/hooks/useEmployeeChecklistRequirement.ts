import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useOrgContext} from '@/hooks/useOrgContext';

export function useEmployeeChecklistRequirement(employeeId?:string) {
 const {data:ctx}=useOrgContext();const id=employeeId??ctx?.employee_id;
 return useQuery({queryKey:['employee-checklist-requirement',ctx?.org_id,id],enabled:!!ctx&&!!id,staleTime:0,refetchInterval:15_000,queryFn:async()=>{
  const r=await supabase.from('employee_checklist_settings').select('bypass_required').eq('org_id',ctx!.org_id).eq('employee_id',id!).maybeSingle();
  if(r.error)throw r.error;return r.data?.bypass_required??true;
 }});
}
