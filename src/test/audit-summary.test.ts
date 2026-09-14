import {it,expect} from 'vitest';
import {auditSummary} from '@/lib/audit-summary';
it('shows changed times without raw record identifiers',()=>{
 const result=auditSummary({action_type:'update',before_json:{id:'private-id',punch_time:'2026-09-09T13:40:00Z'},after_json:{id:'private-id',punch_time:'2026-09-09T13:45:00Z'},reason:'Correct arrival'});
 expect(result.changes).toEqual(['Time: 09:40 AM → 09:45 AM']);
 expect(JSON.stringify(result)).not.toContain('private-id');expect(result.reason).toBe('Correct arrival');
});
it('formats a legacy field edit',()=>expect(auditSummary({event_details:{field_changed:'entry_comment',old_value:'',new_value:'Training'}}).changes).toEqual(['Comment: None → Training']));

