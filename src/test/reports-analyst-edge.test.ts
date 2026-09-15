import {describe, expect, it, vi} from 'vitest';
import {loadEdge} from './helpers/edge-harness';

const employee = '11111111-1111-1111-1111-111111111111';
const timeId = '22222222-2222-2222-2222-222222222222';
const citation = `time_entries:${'c'.repeat(32)}`;

function setup(role = 'manager', failedTable = '') {
  const reads: {client: string; table: string; filters: unknown[][]}[] = [];
  const data: Record<string, unknown[]> = {
    employees: [{id: employee, user_id: 'user', display_name: 'Megan'}],
    time_entries: [{id: timeId, employee_id: employee, user_id: 'user', entry_date: '2026-09-10', total_minutes: 480}],
    checklists: [{id: 'list', owner_user_id: null, name: 'Closing'}],
    checklist_items: [{id: 'item', checklist_id: 'list', title: 'Close office', owner_user_id: null, cadence: 'daily'}],
    checklist_completions: [{id: '33333333-3333-3333-3333-333333333333', item_id: 'item', completed_by: 'user', period_key: '2026-09-10'}],
  };
  const client = (name: string) => ({
    auth: {getUser: async () => ({data: {user: {id: 'user'}}})},
    from: (table: string) => {
      const call = {client: name, table, filters: [] as unknown[][]}; reads.push(call);
      const q: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ['select','eq','gte','lte','order','or','is']) q[method] = (...args) => {call.filters.push([method,...args]); return q;};
      q.maybeSingle = async () => ({data: {org_id: 'office', role}});
      q.limit = async () => ({data: data[table] || [], error: table === failedTable ? {message: 'Unavailable'} : null});
      return q;
    },
  });
  const gateway = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const content = body.model.startsWith('google/')
      ? JSON.stringify({verdict:'clean',summary:'Claims checked.',issues:[]})
      : `Work is recorded. [rec:${citation}] [rec:time_entries:${'p'.repeat(32)}]`;
    return Response.json({choices:[{message:{content}}]});
  });
  const edge = loadEdge('supabase/functions/reports-analyst/index.ts', {
    'https://esm.sh/@supabase/supabase-js@2': {createClient: (_url: string, _key: string, options: {global?: unknown}) => client(options.global ? 'user' : 'service')},
    'npm:@supabase/supabase-js@2/cors': {corsHeaders:{}},
    '../_shared/jailbreak-guard.ts': {guardAiInput: async () => false, JAILBREAK_REFUSAL: 'Refused'},
  }, gateway);
  const request = (body: Record<string,unknown> = {}, signedIn = true) => edge.handle(new Request('https://example.test', {
    method:'POST', headers:signedIn ? {Authorization:'Bearer synthetic'} : {},
    body:JSON.stringify({action:'preview',source:'all',from:'2026-09-01',to:'2026-09-15',...body}),
  }));
  return {request, gateway, reads};
}

describe('shipped reports analyst endpoint', () => {
  it('previews raw attendance and checklist coverage with the user RLS client, without AI', async () => {
    const {request,gateway,reads} = setup();
    const response = await request({org_id:'untrusted-office'});
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({evidence_version:2,record_count:2});
    expect(body.counts).toContainEqual({key:'accountability',label:'Accountability reports',count:0});
    expect(body.records).toBeUndefined();
    expect(gateway).not.toHaveBeenCalled();
    expect(reads.filter(r=>r.client==='service').map(r=>r.table)).toEqual(['org_members']);
    for (const read of reads.filter(r=>r.client==='user')) expect(read.filters).toContainEqual(['eq','org_id','office']);
  });
  it('denies anonymous and staff requests before reading evidence or calling AI', async () => {
    const anon=setup(); expect((await anon.request({},false)).status).toBe(401); expect(anon.reads).toEqual([]);
    const staff=setup('staff'); expect((await staff.request()).status).toBe(403);
    expect(staff.reads.map(r=>r.table)).toEqual(['org_members']); expect(staff.gateway).not.toHaveBeenCalled();
  });
  it('returns a failure instead of a misleading empty count when a source fails', async () => {
    const {request,gateway}=setup('manager','checklist_completions');
    const response=await request(); expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('record_count'); expect(gateway).not.toHaveBeenCalled();
  });
  it('sends both sources to writer and auditor and resolves only real citations to original IDs', async () => {
    const {request,gateway}=setup(); const response=await request({action:'analyze'});
    expect(response.status).toBe(200); const body=await response.json();
    expect(body.record_count).toBe(2); expect(body.citations).toHaveLength(1);
    expect(body.citations[0]).toMatchObject({id:citation,source_id:timeId,source_table:'time_entries'});
    expect(body.answer).not.toContain(`[rec:time_entries:${'p'.repeat(32)}]`);
    expect(gateway).toHaveBeenCalledTimes(2);
    for(const [,init] of gateway.mock.calls) {
      const wire=String(init?.body); expect(wire).toContain(citation); expect(wire).toContain('Checklist completions');
    }
  });
});
