import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useOrgContext} from '@/hooks/useOrgContext';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {formatDate} from '@/lib/time-utils';

export function adjustmentWeek(date:string) {
 const d=new Date(date+'T12:00:00Z'); if(!Number.isFinite(d.getTime()))return null;
 d.setUTCDate(d.getUTCDate()-d.getUTCDay());const start=d.toISOString().slice(0,10);
 d.setUTCDate(d.getUTCDate()+6);return {start,end:d.toISOString().slice(0,10)};
}
export default function WorkedHourAdjustments({employeeId}:{employeeId:string}) {
 const {data:ctx}=useOrgContext();const qc=useQueryClient();
 const [open,setOpen]=useState(false);const [date,setDate]=useState('');const [hours,setHours]=useState('');const [reason,setReason]=useState('');
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const allowed=ctx?.role==='owner'||ctx?.role==='manager';const week=adjustmentWeek(date);
 const {data:history=[],error:historyError}=useQuery({queryKey:['worked-adjustments',employeeId,ctx?.org_id],enabled:!!ctx,refetchInterval:30_000,queryFn:async()=>{
  const r=await supabase.from('worked_hour_adjustments').select('*').eq('org_id',ctx!.org_id).eq('employee_id',employeeId).order('entry_date',{ascending:false});if(r.error)throw r.error;return r.data;
 }});
 const {data:totals,error:totalError}=useQuery({queryKey:['worked-reconciliation',employeeId,ctx?.org_id,week?.start],enabled:!!ctx&&!!week,refetchInterval:30_000,queryFn:async()=>{
  const [time,payroll]=await Promise.all([
   supabase.from('time_entries').select('total_minutes').eq('org_id',ctx!.org_id).eq('employee_id',employeeId).gte('entry_date',week!.start).lte('entry_date',week!.end),
   supabase.from('payroll_pto_records').select('worked_hours').eq('org_id',ctx!.org_id).eq('employee_id',employeeId).eq('period_start',week!.start).eq('period_end',week!.end)
  ]);if(time.error)throw time.error;if(payroll.error)throw payroll.error;
  return {recorded:time.data.reduce((sum,r)=>sum+Number(r.total_minutes||0),0)/60,payroll:payroll.data.some(r=>r.worked_hours!=null)?payroll.data.reduce((sum,r)=>sum+Number(r.worked_hours||0),0):null};
 }});
 const offset=week?history.filter(r=>r.entry_date>=week.start&&r.entry_date<=week.end).reduce((s,r)=>s+Number(r.hours_delta),0):0;
 const adjusted=totals?Math.round((totals.recorded+offset)*100)/100:null;
 async function save(){
  const delta=Number(hours);
  if(!allowed||!week||!hours.trim()||!Number.isFinite(delta)||delta===0||Math.abs(delta)>168||Math.abs(delta*100-Math.round(delta*100))>1e-7||reason.trim().length<3||reason.trim().length>2000){setError('Enter a date, nonzero hours with at most two decimals, and a reason.');return;}
  setBusy(true);setError('');
  try {const r=await supabase.rpc('add_worked_hour_adjustment',{p_id:requestId,p_employee_id:employeeId,p_entry_date:date,p_hours_delta:delta,p_reason:reason.trim()});if(r.error)throw r.error;
   setHours('');setReason('');setRequestId(crypto.randomUUID());setOpen(false);await qc.invalidateQueries();
  }catch(e){setError(e instanceof Error?e.message:(e as {message?:string})?.message||'Could not save the adjustment.');}finally{setBusy(false);}
 }
 return <section className="space-y-3 mb-4 rounded-lg border p-3">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Worked-hour adjustments</h3>{allowed&&<Button size="sm" onClick={()=>{setOpen(!open);setError('');}}>Offset hours</Button>}</div>
  <p className="text-xs text-muted-foreground">Adjustments count toward worked hours and PTO in the week paid. Original time entries stay in place. Correct an adjustment with an opposite entry and a reason.</p>
  {open&&allowed&&<div className="space-y-3">
   <div><Label htmlFor={`offset-date-${employeeId}`}>Date of adjustment</Label><Input id={`offset-date-${employeeId}`} type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></div>
   {totals&&week&&<div className="text-sm space-y-1"><p>{formatDate(week.start)} – {formatDate(week.end)}</p><p>Recorded: {totals.recorded.toFixed(2)}h · Adjustments: {offset.toFixed(2)}h · Adjusted: {adjusted?.toFixed(2)}h</p><p>Pay-stub worked hours: {totals.payroll==null?'Not available':totals.payroll.toFixed(2)+'h'}</p>{totals.payroll!=null&&<p>Difference (adjusted minus pay stub): {(adjusted!-totals.payroll).toFixed(2)}h</p>}</div>}
   {totalError&&<p role="alert">Weekly totals could not be loaded.</p>}
   <div><Label htmlFor={`offset-hours-${employeeId}`}>Hours to add or subtract</Label><Input id={`offset-hours-${employeeId}`} type="number" step="0.01" min="-168" max="168" placeholder="10 or -2.50" value={hours} disabled={busy} onChange={e=>setHours(e.target.value)}/></div>
   <div><Label htmlFor={`offset-reason-${employeeId}`}>Reason (required)</Label><Textarea id={`offset-reason-${employeeId}`} maxLength={2000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></div>
   <Button disabled={busy} onClick={save}>{busy?'Saving…':'Save adjustment'}</Button>
  </div>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {historyError&&<p role="alert">Adjustment history could not be loaded.</p>}
  {history.map(r=><div className="border-t pt-2 text-sm" key={r.id}><p>{formatDate(r.entry_date)} · {Number(r.hours_delta)>0?'+':''}{Number(r.hours_delta).toFixed(2)}h</p><p>{r.reason}</p><p className="text-xs text-muted-foreground">Saved {formatDate(r.created_at.slice(0,10))}</p></div>)}
 </section>;
}
