// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadEdge } from './helpers/edge-harness';
const orgId='11111111-1111-4111-8111-111111111111';
const source={id:'source-one',code:'D6058',description:'Implant crown',notes:'The implant crown and its abutment are one restorative course. Collect the balance at delivery.',schedule_id:'office-schedule'};
const recipe={sourceId:source.id,title:'Implant Crown',summary:'Prepare and deliver an implant-supported crown.',classification:'restoration',grouping:'same_tooth'};
function setup(options: {member?:boolean;notes?:string;recipes?:unknown[];finish?:string;legacy?:boolean;content?:unknown}={}) {
  const filters=vi.fn(); const writes=vi.fn();
  const from=(table:string)=>{
    const result=()=>({data:table==='org_members'?(options.member===false?null:{org_id:orgId}):table==='fee_schedule_items'?[{...source,notes:options.notes??source.notes}]:[],error:null});
    const builder:Record<string,any>={then:(fn:(v:unknown)=>unknown)=>Promise.resolve(result()).then(fn),maybeSingle:async()=>result()};
    for(const method of ['select','eq','neq','order','limit'])builder[method]=(...args:unknown[])=>{filters(table,method,...args);return builder;};
    for(const method of ['insert','upsert','update','delete'])builder[method]=(...args:unknown[])=>{writes(...args);return builder;};
    return builder;
  };
  const gateway=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:options.finish??'stop',message:{content:JSON.stringify(options.content??{recipes:options.recipes??[recipe]})}}]})));
  const client={from,rpc:async()=>({data:true}),auth:{getUser:async()=>({data:{user:{id:'staff'}}})}};
  const edge=loadEdge(`supabase/functions/${options.legacy?'name-visits':'fof-office-guidance'}/index.ts`,{'https://esm.sh/@supabase/supabase-js@2':{createClient:()=>client}},gateway);
  const run=(body:unknown={orgId})=>edge.handle(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:JSON.stringify(body)}));
  return {run,gateway,filters,writes};
}
describe('office-only AI guidance endpoint',()=>{
  it('loads the complete office notes under the requested active membership, with no writes',async()=>{
    const test=setup();const response=await test.run();expect(response.status).toBe(200);
    const body=await response.json();expect(body.recipes[0]).toMatchObject({...recipe,code:'D6058',scheduleId:'office-schedule'});
    expect(test.filters).toHaveBeenCalledWith('org_members','eq','org_id',orgId);
    expect(test.filters).toHaveBeenCalledWith('fee_schedule_items','eq','fee_schedules.org_id',orgId);
    expect(test.filters).toHaveBeenCalledWith('fee_schedule_items','eq','fee_schedules.kind','office');
    expect(test.writes).not.toHaveBeenCalled();
  });
  it.each(['patientName','visits','context','codes','image','question'])('rejects client %s before a gateway request',async field=>{
    const test=setup();const response=await test.run({orgId,[field]:'PRIVATE_SENTINEL'});
    expect(response.status).toBe(400);expect(test.gateway).not.toHaveBeenCalled();
  });
  it('rejects nonmembers before using paid AI',async()=>{
    const test=setup({member:false});expect((await test.run()).status).toBe(403);expect(test.gateway).not.toHaveBeenCalled();
  });
  it('withholds case-specific notes rather than forwarding them',async()=>{
    const test=setup({notes:'This patient owes $600. Member ID: ABC12345'});const response=await test.run();
    expect(response.status).toBe(200);expect((await response.json()).warnings).not.toHaveLength(0);expect(test.gateway).not.toHaveBeenCalled();
  });
  it.each([
    {recipes:[{...recipe,sourceId:'invented'}]},
    {recipes:[{...recipe,title:'Implant Crown #8'}]},
    {recipes:[]},
    {finish:'length'},
  ])('refuses invented, incomplete, or patient-specific suggestions',async options=>{
    const test=setup(options);expect((await test.run()).status).toBe(502);expect(test.writes).not.toHaveBeenCalled();
  });
  it('the visit-naming endpoint words the plan from codes and visit order only, for active members',async()=>{
    const test=setup({legacy:true,content:{names:['At the Records Visit','At Implant Surgery'],treatment:'Dr. Scott will place a dental implant on tooth #8.'}});
    const response=await test.run({slots:['Payment 1','Payment 2'],visits:[{procedures:['CT Scan']},{procedures:['Dental Implant (tooth #8)']}],wantTreatment:true,doctorName:'Dr. Scott'});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({names:['At the Records Visit','At Implant Surgery'],treatment:'Dr. Scott will place a dental implant on tooth #8.'});
    expect(test.gateway).toHaveBeenCalledTimes(1);
    const sent=JSON.parse(String(test.gateway.mock.calls[0][1].body));
    expect(sent.messages.at(-1).content).toContain('Dental Implant (tooth #8)');
    expect(test.writes).not.toHaveBeenCalled();
  });
  it('the visit-naming endpoint refuses nonmembers and malformed slot lists before using paid AI',async()=>{
    const nonmember=setup({legacy:true,member:false});expect((await nonmember.run({slots:['Payment 1'],visits:[]})).status).toBe(403);expect(nonmember.gateway).not.toHaveBeenCalled();
    const empty=setup({legacy:true});expect((await empty.run({slots:[],visits:[]})).status).toBe(400);expect(empty.gateway).not.toHaveBeenCalled();
  });
});
