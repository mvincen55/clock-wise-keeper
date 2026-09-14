import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useOrgContext} from '@/hooks/useOrgContext';
import {useEmployeeChecklistRequirement} from '@/hooks/useEmployeeChecklistRequirement';
import {supabase} from '@/integrations/supabase/client';
import {Switch} from '@/components/ui/switch';
import {Label} from '@/components/ui/label';
import {toast} from 'sonner';

export default function EmployeeChecklistSetting({employeeId}:{employeeId:string}) {
 const {data:ctx}=useOrgContext();const requirement=useEmployeeChecklistRequirement(employeeId);const qc=useQueryClient();const [saving,setSaving]=useState(false);
 const allowed=ctx?.role==='owner'||ctx?.role==='manager';
 if(!allowed)return null;
 async function change(required:boolean){
  setSaving(true);
  try{const r=await supabase.rpc('set_employee_checklist_requirement',{p_employee_id:employeeId,p_required:required});if(r.error)throw r.error;
   await Promise.all([qc.invalidateQueries({queryKey:['employee-checklist-requirement']}),qc.invalidateQueries({queryKey:['checklist-gating']}),qc.invalidateQueries({queryKey:['checklist-bypasses']})]);
   toast.success(required?'Checklist bypass required':'Checklist bypass not required');
  }catch(e){toast.error((e as {message?:string})?.message||'Could not save checklist setting');}finally{setSaving(false);}
 }
 return <div className="rounded-lg border p-3 mb-3 space-y-2">
  <div className="flex items-center justify-between gap-3"><Label htmlFor={`checklist-required-${employeeId}`}>Checklist bypass required</Label><Switch id={`checklist-required-${employeeId}`} checked={requirement.data??true} disabled={saving||requirement.isLoading||!!requirement.error} onCheckedChange={change}/></div>
  <p className="text-xs text-muted-foreground">Turn off for someone who does not use checklists. They can clock out without checklist prompts or new bypass alerts. Existing bypass history is retained.</p>
  {requirement.error&&<p role="alert" className="text-xs text-destructive">Checklist setting could not be loaded.</p>}
 </div>;
}
