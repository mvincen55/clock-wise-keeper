import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useOrgContext} from '@/hooks/useOrgContext';
import {formatDate} from '@/lib/time-utils';

type PayrollPtoRow={id:string;period_start:string;period_end:string;check_date:string;pto_hours:number;pto_ytd_hours:number|null;worked_hours:number|null;source_file:string;source_page:number;review_note:string|null;entered_by_label:string|null};
export default function PayrollPtoHistory({employeeId}:{employeeId:string}) {
 const {data:ctx}=useOrgContext();
 const {data,error}=useQuery({queryKey:['payroll-pto',ctx?.org_id,employeeId],enabled:!!ctx&&!!employeeId,refetchInterval:30_000,queryFn:async()=>{
  const result=await supabase.from('payroll_pto_records').select('*').eq('org_id',ctx!.org_id).eq('employee_id',employeeId).order('period_start',{ascending:false});
  if(result.error)throw result.error;return result.data as PayrollPtoRow[];
 }});
 if(error)return <p role="alert" className="text-sm text-destructive">Payroll PTO history could not be loaded.</p>;
 if(!data?.length)return <p className="text-xs text-muted-foreground">No weekly PTO records have been entered yet.</p>;
 return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Recorded PTO</h3>
  <p className="text-xs text-muted-foreground">PTO is recorded by week and counted once in your balance. Year-to-date totals are for reference. Hours before your starting balance are not deducted again.</p>
  <div className="space-y-3">{data.map(r=><div key={r.id} className="rounded border p-3 text-sm">
   <div className="flex flex-wrap justify-between gap-2"><span>{formatDate(r.period_start)} – {formatDate(r.period_end)}</span><strong>{Number(r.pto_hours).toFixed(2)}h PTO used</strong></div>
   <p className="text-xs text-muted-foreground">Worked: {r.worked_hours==null?'Not reported':`${Number(r.worked_hours).toFixed(2)}h`} · PTO year to date: {r.pto_ytd_hours==null?'Not reported':`${Number(r.pto_ytd_hours).toFixed(2)}h`}</p>
   <p className="text-xs text-muted-foreground">Paychex check {formatDate(r.check_date)} · {r.source_file}, page {r.source_page}</p>
   
  </div>)}</div>
 </section>;
}
