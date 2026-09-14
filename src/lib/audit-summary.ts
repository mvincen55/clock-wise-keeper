import {formatTime} from '@/lib/time-utils';
const labels:Record<string,string>={punch_time:'Time',punch_type:'Punch',source:'Source',is_remote:'Location',entry_comment:'Comment',total_minutes:'Worked time',voided_at:'Removed',status:'Status',reason_text:'Reason'};
function value(key:string,v:unknown):string {
 if(v===null||v===undefined||v==='')return 'None';
 if(key==='punch_time')return formatTime(String(v));
 if(key==='punch_type')return v==='in'?'Clock in':'Clock out';
 if(key==='is_remote')return v?'Remote':'On-site';
 if(key==='voided_at')return 'Yes';
 if(key==='total_minutes')return `${(Number(v)/60).toFixed(2)} hours`;
 if(key==='source')return ({manual:'Manual',import:'Import',auto_location:'GPS',system_adjustment:'System'} as Record<string,string>)[String(v)]||String(v);
 return String(v);
}
export function auditSummary(event:any):{title:string;changes:string[];reason:string|null} {
 const type=event.action_type||event.event_type||'';
 const title=({insert:'Time recorded',update:'Time updated',delete:'Time removed',clock_in:'Clocked in',clock_out:'Clocked out',punch_created:'Time recorded',punch_edit:'Time corrected',punch_edited:'Time corrected',punch_deleted:'Time removed',manager_edit:'Manager correction',request_create:'Correction requested',request_approve:'Correction approved',request_deny:'Correction declined'} as Record<string,string>)[type]||'Record updated';
 const detail=event.event_details||{}, before=event.before_json||detail.before||{},after=event.after_json||detail.after||{};
 const changes:string[]=[];
 for(const key of Object.keys(labels)){
  if(before[key]===after[key]||(!(key in before)&&!(key in after)))continue;
  changes.push(`${labels[key]}: ${value(key,before[key])} → ${value(key,after[key])}`);
 }
 if(!changes.length&&detail.field_changed&&labels[detail.field_changed])changes.push(`${labels[detail.field_changed]}: ${value(detail.field_changed,detail.old_value)} → ${value(detail.field_changed,detail.new_value)}`);
 if(!changes.length&&detail.punch_time)changes.push(`${value('punch_type',detail.punch_type)} at ${value('punch_time',detail.punch_time)}`);
 return {title,changes,reason:event.reason||detail.reason_comment||detail.reason||null};
}

