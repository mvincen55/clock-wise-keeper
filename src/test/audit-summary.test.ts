import {it,expect} from 'vitest';
import {auditSummary} from '@/lib/audit-summary';
it('shows changed times without raw record identifiers',()=>{
 const result=auditSummary({action_type:'update',before_json:{id:'private-id',punch_time:'2026-09-09T13:40:00Z'},after_json:{id:'private-id',punch_time:'2026-09-09T13:45:00Z'},reason:'Correct arrival'});
 expect(result.changes).toEqual(['Time: 09:40 AM → 09:45 AM']);
 expect(JSON.stringify(result)).not.toContain('private-id');expect(result.reason).toBe('Correct arrival');
});
it('formats a legacy field edit',()=>expect(auditSummary({event_details:{field_changed:'entry_comment',old_value:'',new_value:'Training'}}).changes).toEqual(['Comment: None → Training']));

it('reports a trigger-logged void as a removal with its void reason',()=>{
 const punch={id:'p1',punch_time:'2026-09-09T13:40:00Z',punch_type:'in',voided_at:null,void_reason:null};
 const result=auditSummary({event_type:'punch_edit',action_type:'update',before_json:punch,after_json:{...punch,voided_at:'2026-09-14T22:08:00Z',void_reason:'Superseded by re-import (overwrite)'}});
 expect(result.title).toBe('Time removed');
 expect(result.changes).toEqual(['Removed: None → Yes']);
 expect(result.reason).toBe('Superseded by re-import (overwrite)');
});
it('shows no changes for an update that changed nothing audited',()=>{
 const punch={id:'p1',punch_time:'2026-09-09T13:40:00Z',punch_type:'in',voided_at:null};
 expect(auditSummary({event_type:'punch_edit',before_json:punch,after_json:{...punch}}).changes).toEqual([]);
});
it('does not report untouched null fields on a recorded punch',()=>{
 expect(auditSummary({event_type:'punch_created',after_json:{punch_time:'2026-09-09T13:40:00Z',punch_type:'in',source:'manual',voided_at:null}}).changes).toEqual(['Time: None → 09:40 AM','Punch: None → Clock in','Source: None → Manual']);
});
import {describeAuditEvent} from '@/lib/audit-summary';
it('describes a legacy day-comment edit in English',()=>{
 expect(describeAuditEvent({event_type:'manual_edit',actor_id:'u2',user_id:'u1',event_details:{field_changed:'entry_comment',old_value:'',new_value:'Training'}},{employee:'AA14',actor:'DA14'})).toBe('DA14 changed the day comment from None to Training for AA14.');
});
