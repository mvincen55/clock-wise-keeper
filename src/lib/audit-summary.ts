import {formatTime} from '@/lib/time-utils';
const labels:Record<string,string>={punch_time:'Time',punch_type:'Punch',source:'Source',is_remote:'Location',entry_comment:'Comment',total_minutes:'Worked time',voided_at:'Removed',status:'Status',reason_text:'Reason'};
export type AuditFieldChange={key:string;field:string;before:string;after:string};
type Snapshot=Record<string,unknown>;
export type AuditLike={event_type?:string|null;action_type?:string|null;reason?:string|null;before_json?:unknown;after_json?:unknown;event_details?:unknown};
const asSnapshot=(v:unknown):Snapshot=>v&&typeof v==='object'?v as Snapshot:{};
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
function snapshots(event:AuditLike):{detail:Snapshot;before:Snapshot;after:Snapshot} {
 const detail=asSnapshot(event.event_details);
 return {detail,before:asSnapshot(event.before_json||detail.before),after:asSnapshot(event.after_json||detail.after)};
}
/** True when the row carries both a before and an after snapshot (an update, not an insert or delete). */
export function hasBeforeAndAfter(event:AuditLike):boolean {
 const {before,after}=snapshots(event);
 return Object.keys(before).length>0&&Object.keys(after).length>0;
}
/** True when the row records a punch being voided (the DB trigger logs a void as a punch_edit UPDATE). */
export function isVoidEvent(event:AuditLike):boolean {
 const {before,after}=snapshots(event);
 return !!after.voided_at&&!before.voided_at;
}
/** The event type as it should be reported: a void logged as punch_edit is a punch_voided. */
export function effectiveEventType(event:AuditLike):string {
 const type=event.event_type||event.action_type||'';
 return (type==='punch_edit'||type==='update')&&isVoidEvent(event)?'punch_voided':type;
}
/** Every audited field whose value changed between the before and after snapshots. */
export function auditFieldChanges(event:AuditLike):AuditFieldChange[] {
 const {detail,before,after}=snapshots(event);
 const changes:AuditFieldChange[]=[];
 for(const key of Object.keys(labels)){
  if(before[key]===after[key]||(!(key in before)&&!(key in after)))continue;
  const b=value(key,before[key]),a=value(key,after[key]);
  if(b===a)continue;
  changes.push({key,field:labels[key],before:b,after:a});
 }
 if(!changes.length&&typeof detail.field_changed==='string'&&labels[detail.field_changed]){
  const key=detail.field_changed;
  changes.push({key,field:labels[key],before:value(key,detail.old_value),after:value(key,detail.new_value)});
 }
 return changes;
}
/** True when the row is an update whose snapshots show no audited field changing (a no-op write). */
export function isNoOpUpdate(event:AuditLike):boolean {
 return hasBeforeAndAfter(event)&&auditFieldChanges(event).length===0;
}
export function auditReason(event:AuditLike):string|null {
 const {detail,after}=snapshots(event);
 const r=event.reason||detail.reason_comment||detail.reason||(isVoidEvent(event)?after.void_reason:null);
 return typeof r==='string'&&r?r:null;
}
export function auditSummary(event:AuditLike):{title:string;changes:string[];reason:string|null} {
 const type=effectiveEventType(event);
 const title=({insert:'Time recorded',update:'Time updated',delete:'Time removed',clock_in:'Clocked in',clock_out:'Clocked out',punch_created:'Time recorded',punch_edit:'Time corrected',punch_edited:'Time corrected',punch_deleted:'Time removed',punch_voided:'Time removed',manager_edit:'Manager correction',request_create:'Correction requested',request_approve:'Correction approved',request_deny:'Correction declined'} as Record<string,string>)[type]||'Record updated';
 const {detail}=snapshots(event);
 const changes=auditFieldChanges(event).map(c=>`${c.field}: ${c.before} → ${c.after}`);
 if(!changes.length&&typeof detail.punch_time==='string')changes.push(`${value('punch_type',detail.punch_type)} at ${value('punch_time',detail.punch_time)}`);
 return {title,changes,reason:auditReason(event)};
}

/** Who is named in a sentence: canonical staff codes only, never a name. */
export type AuditNames={employee:string;actor:string|null};
const punchWord=(v:unknown)=>v==='out'?'clock-out':'clock-in';
const fieldWord:Record<string,string>={is_remote:'work location',entry_comment:'day comment',total_minutes:'worked time',status:'status',reason_text:'reason',source:'source',punch_type:'punch type',punch_time:'time'};
/**
 * One plain-English sentence for an audit row, e.g.
 * "DA14 removed the clock-out at 1:34 PM." — reason is returned separately.
 */
export function describeAuditEvent(event:AuditLike&{actor_id?:string|null;user_id?:string|null},names:AuditNames):string {
 const {detail,before,after}=snapshots(event);
 const type=effectiveEventType(event);
 const actor=names.actor||'The system';
 const selfActed=!!event.actor_id&&event.actor_id===event.user_id;
 const row=Object.keys(after).length?after:before;
 const punch=punchWord(row.punch_type??detail.punch_type);
 const at=row.punch_time??detail.punch_time;
 const time=typeof at==='string'?formatTime(at):null;
 const changes=auditFieldChanges(event);
 switch(type){
  case 'punch_voided':return `${actor} removed the ${punch} at ${time}.`;
  case 'punch_deleted':case 'delete':return `${actor} deleted the ${punch} at ${time}.`;
  case 'punch_edit':case 'punch_edited':case 'update':{
   if(!changes.length)return time?`${actor} re-saved the ${punch} at ${time} without changing it.`:`${actor} re-saved the record without changing it.`;
   const parts=changes.map(c=>{
    if(c.key==='punch_time')return `moved the ${punch} from ${c.before} to ${c.after}`;
    if(c.key==='punch_type')return `changed it from a ${punchWord(before.punch_type)} to a ${punchWord(after.punch_type)}`;
    if(c.key==='voided_at')return `restored the ${punch} at ${time}`;
    return `changed the ${fieldWord[c.key]||c.field.toLowerCase()} from ${c.before} to ${c.after}`;
   });
   return `${actor} ${parts.join(' and ')}.`;
  }
  case 'punch_created':case 'clock_in':case 'clock_out':case 'punch_added':case 'punch_added_manually':case 'insert':{
   const source=String(row.source??detail.source??'');
   if(source==='import')return `${actor} added a ${punch} at ${time} for ${names.employee} from an imported timesheet.`;
   if(selfActed||!names.actor)return `${names.employee} clocked ${row.punch_type==='out'?'out':'in'} at ${time}.`;
   return `${actor} added a ${punch} at ${time} for ${names.employee}.`;
  }
  case 'manual_edit':case 'manager_edit':{
   if(changes.length)return `${actor} ${changes.map(c=>`changed the ${fieldWord[c.key]||c.field.toLowerCase()} from ${c.before} to ${c.after}`).join(' and ')} for ${names.employee}.`;
   return `${actor} edited the day for ${names.employee}.`;
  }
  case 'request_create':return `${names.employee} asked for a correction.`;
  case 'request_approve':case 'request_approved':return `${actor} approved a correction request from ${names.employee}.`;
  case 'request_deny':case 'request_denied':return `${actor} declined a correction request from ${names.employee}.`;
  case 'day_off_added':return `${actor} added a day off for ${names.employee}.`;
  case 'day_off_removed':return `${actor} removed a day off for ${names.employee}.`;
  default:{
   const what=type.replace(/_/g,' ');
   return changes.length?`${actor} ${what}: ${changes.map(c=>`${c.field} ${c.before} → ${c.after}`).join('; ')}.`:`${actor} ${what} for ${names.employee}.`;
  }
 }
}
