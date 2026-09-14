import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useOrgContext} from '@/hooks/useOrgContext';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Button} from '@/components/ui/button';

export default function AttendanceGraceSettingsCard(){
 const {data:ctx}=useOrgContext();const qc=useQueryClient();
 const [draft,setDraft]=useState<string|null>(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const {data,isLoading,error}=useQuery({queryKey:['office-grace',ctx?.org_id],enabled:!!ctx,queryFn:async()=>{
  const r=await (supabase as any).from('office_attendance_settings').select('grace_minutes').eq('org_id',ctx!.org_id).maybeSingle();if(r.error)throw r.error;return r.data;
 }});
 if(!ctx||!['owner','manager'].includes(ctx.role))return null;
 async function save(){
  const minutes=Number(draft??data?.grace_minutes??5);
  if(!Number.isInteger(minutes)||minutes<0||minutes>60||draft===''){setMessage('Enter whole minutes from 0 to 60.');return;}
  setBusy(true);setMessage('');
  try{const r=await (supabase as any).rpc('set_office_attendance_grace',{p_org_id:ctx!.org_id,p_minutes:minutes});if(r.error)throw r.error;await qc.invalidateQueries();setDraft(null);setMessage('Grace period saved for everyone.');}
  catch(e){setMessage((e as {message?:string}).message??'Could not save grace period.');}finally{setBusy(false);}
 }
 return <Card><CardHeader><CardTitle>Attendance grace period</CardTitle></CardHeader><CardContent className="space-y-3">
  <p className="text-sm text-muted-foreground">One grace period applies to everyone and every scheduled day in this office.</p>
  <Label htmlFor="office-grace-minutes">Grace period (minutes)</Label>
  <Input id="office-grace-minutes" type="number" min={0} max={60} step={1} value={draft??String(data?.grace_minutes??5)} onChange={e=>setDraft(e.target.value)} disabled={busy||isLoading||!!error}/>
  {error&&<p role="alert">Grace period could not be loaded.</p>}
  <Button onClick={save} disabled={busy||isLoading||!!error}>{busy?'Saving…':'Save grace period'}</Button>
  {message&&<p role="status" className="text-sm">{message}</p>}
 </CardContent></Card>;
}

