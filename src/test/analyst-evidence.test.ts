import {describe,it,expect,vi,afterEach} from 'vitest';
import {normalizeEvidence,periodRange,loadEvidence,evidenceChunks,validDate,type EvidenceDb} from '../../supabase/functions/_shared/analyst-evidence';
import {scrubMessages} from '../../supabase/functions/_shared/ai-safe';

const employees=[{id:'e1',user_id:'u1',display_name:'Megan'},{id:'e2',user_id:null,display_name:'Pending hire'}];
afterEach(()=>vi.useRealTimers());
describe('analyst evidence',()=>{
  it('reads imported attendance without formal reports and avoids counting the status twice',()=>{
    const rows=normalizeEvidence({employees,time_entries:[{id:'111111',employee_id:'e2',entry_date:'2026-09-10',total_minutes:480}],attendance_day_status:[{id:'222222',employee_id:'e2',entry_date:'2026-09-10',has_punches:true,is_scheduled_day:true}]},'2026-09-01','2026-09-30');
    expect(rows).toHaveLength(1);expect(rows[0].who).toBe('Pending hire');expect(rows[0].id).toBe('time_entries:bbbbbb');
    expect(rows[0].summary).toContain('480');
  });
  it('does not blame off days, office closures, planned time off, owners, or unfinished days',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    const rows=normalizeEvidence({employees,owners:[{id:'owner-member',user_id:'owner'}],attendance_day_status:[
      {id:'111111',employee_id:'e1',user_id:'u1',entry_date:'2026-09-03',is_scheduled_day:false,is_absent:true},
      {id:'222222',employee_id:'e1',user_id:'u1',entry_date:'2026-09-07',is_scheduled_day:true,office_closed:true,is_absent:true},
      {id:'333333',employee_id:'e1',user_id:'u1',entry_date:'2026-09-08',is_scheduled_day:true,is_absent:true},
      {id:'444444',employee_id:'e1',user_id:'u1',entry_date:'2026-09-09',is_scheduled_day:true,is_absent:true},
      {id:'555555',employee_id:'owner-employee',user_id:'owner',entry_date:'2026-09-10',is_scheduled_day:true,is_absent:true},
      {id:'666666',employee_id:'e1',user_id:'u1',entry_date:'2026-09-15',is_scheduled_day:true,is_absent:true},
    ],days_off:[{id:'777777',employee_id:'e1',date_start:'2026-09-08',date_end:'2026-09-08',type:'unscheduled'},{id:'888888',employee_id:'e1',date_start:'2026-09-09',date_end:'2026-09-09',type:'scheduled_with_notice'}]},'2026-09-01','2026-09-30');
    expect(rows.filter(r=>r.kind==='attendance').map(r=>r.status)).toEqual(['day_not_finished','recorded_day_off','recorded_callout','office_closed','not_scheduled']);
  });
  it('uses overlapping checklist periods, shared-task attribution, and omits private lists/items',()=>{
    const data={employees,checklists:[{id:'list',name:'Closing',owner_user_id:null},{id:'private-list',owner_user_id:'u2'}],checklist_items:[
      {id:'item',checklist_id:'list',title:'Close office',cadence:'weekly',per_person:false},
      {id:'private',checklist_id:'list',owner_user_id:'u2'},
      {id:'hidden-list-item',checklist_id:'private-list'},
    ],checklist_completions:[
      {id:'111111',item_id:'item',completed_by:'u1',period_key:'week-2026-09-07',completed_at:'2026-09-12T21:00:00Z'},
      {id:'222222',item_id:'private',completed_by:'u2',period_key:'2026-09-10'},
      {id:'333333',item_id:'hidden-list-item',completed_by:'u2',period_key:'2026-09-10'},
    ]};
    const rows=normalizeEvidence(data,'2026-09-10','2026-09-10');expect(rows).toHaveLength(1);
    expect(rows[0].summary).toContain('shared team task');expect(rows[0].period_end).toBe('2026-09-13');
  });
  it('preserves resolved bypass context and overlapping multi-day time off',()=>{
    const rows=normalizeEvidence({employees,days_off:[{id:'111111',employee_id:'e1',date_start:'2026-08-29',date_end:'2026-09-03',type:'scheduled_with_notice'}],checklist_bypasses:[{id:'222222',employee_id:'e1',checklist_date:'2026-09-02',incomplete_count:2,resolved:true,reason:'Coverage change'}]},'2026-09-01','2026-09-10');
    expect(rows).toHaveLength(2);expect(rows[0].status).toBe('reason_recorded');expect(rows[0].member_reason).toBe('Coverage change');
  });
  it('honors the selected employee even for employees without logins',()=>{
    const rows=normalizeEvidence({employees,time_entries:[{id:'111111',employee_id:'e1',entry_date:'2026-09-10'},{id:'222222',employee_id:'e2',entry_date:'2026-09-10'}]},'','','e2');
    expect(rows.map(r=>r.who)).toEqual(['Pending hire']);
  });
  it('parses daily, weekly, monthly, yearly ranges and rejects invalid calendar dates',()=>{
    expect(periodRange('2026-09')).toEqual(['2026-09-01','2026-09-30']);expect(periodRange('2026')).toEqual(['2026-01-01','2026-12-31']);
    expect(periodRange('2026-09-10')).toEqual(['2026-09-10','2026-09-10']);expect(validDate('2026-02-30')).toBe(false);
    expect(periodRange('bad-key')).toBeNull();
  });
  it('keeps later evidence through the AI scrubber instead of silently truncating it',()=>{
    const records=normalizeEvidence({employees,time_entries:Array.from({length:150},(_,i)=>({id:`00000000-0000-0000-0000-${String(i).padStart(12,'0')}`,employee_id:'e1',entry_date:'2026-09-10',total_minutes:480}))},'','');
    const chunks=evidenceChunks(records);expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(c=>c.length<=16000)).toBe(true);
    const wire=scrubMessages(chunks.map(content=>({role:'user',content})), 'reports-analyst').map(m=>m.content).join('\n');
    expect(wire).toContain(`[rec:${records.at(-1)!.id}]`);
  });
});

function fakeDb(failure?:string) {
  const calls: {table:string;method:string;args:unknown[]}[]=[];
  const db={from:(table:string)=>{
    const q={} as ReturnType<ReturnType<EvidenceDb['from']>['select']>;
    for(const method of ['select','eq','gte','lte','order','or','is'] as const)q[method]=(...args:unknown[])=>{calls.push({table,method,args});return q;};
    q.limit=async()=>({data:table==='employees'?employees:[],error:failure===table?{message:'unavailable'}:null});return q;
  }};
  return {db,calls};
}
describe('evidence queries',()=>{
  it('scopes every source to the resolved office and only reads selected sources',async()=>{
    const {db,calls}=fakeDb();const result=await loadEvidence(db,'office',{from:'2026-09-01',to:'2026-09-15',source:'checklists'});
    expect(result.evidence_version).toBe(2);expect(result.record_count).toBe(0);
    const tables=[...new Set(calls.map(c=>c.table))];expect(tables).not.toContain('time_entries');expect(tables).not.toContain('accountability_reports');
    for(const table of tables)expect(calls).toContainEqual({table,method:'eq',args:['org_id','office']});
    expect(calls).toContainEqual({table:'checklists',method:'is',args:['owner_user_id',null]});
  });
  it('uses date overlap and an employee boundary for raw and formal records',async()=>{
    const {db,calls}=fakeDb();await loadEvidence(db,'office',{from:'2026-09-01',to:'2026-09-15',source:'all',employeeId:'e1'});
    expect(calls).toContainEqual({table:'days_off',method:'gte',args:['date_end','2026-09-01']});
    expect(calls).toContainEqual({table:'accountability_reports',method:'eq',args:['subject_employee_id','e1']});
    expect(calls).toContainEqual({table:'checklist_completions',method:'eq',args:['completed_by','u1']});
  });
  it('does not turn a source failure into zero records',async()=>{
    const {db}=fakeDb('checklist_completions');await expect(loadEvidence(db,'office',{from:'',to:'',source:'checklists'})).rejects.toThrow('Could not load checklist completions');
  });
  it('rejects an employee outside the office before source queries',async()=>{
    const {db,calls}=fakeDb();await expect(loadEvidence(db,'office',{from:'',to:'',source:'all',employeeId:'other-office'})).rejects.toThrow('not available in this office');expect([...new Set(calls.map(c=>c.table))]).toEqual(['employees']);
  });
});
