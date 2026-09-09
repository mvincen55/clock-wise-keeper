import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFofPolicySettings, useUpsertFofPolicySettings, useSavePaymentClassification } from '@/hooks/useFofPolicySettings';
import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
const mock=vi.hoisted(()=>({org:'office-a',role:'owner',upsert:vi.fn(),reads:[] as string[],rows:{} as Record<string,unknown>}));
vi.mock('@/hooks/useOrgContext',()=>({useOrgContext:()=>({data:{org_id:mock.org,role:mock.role}})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({select:()=>({eq:(_field:string,org:string)=>({maybeSingle:async()=>{mock.reads.push(org);return {data:mock.rows[org]??null,error:null};}})}),upsert:mock.upsert})}}));
function wrapper(){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return ({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;}
beforeEach(()=>{mock.org='office-a';mock.role='owner';mock.reads=[];mock.rows={};mock.upsert.mockReset().mockResolvedValue({error:null});});
describe('payment setting organization boundaries',()=>{
  it('reads and caches policies independently and leaves absent offices in legacy mode',async()=>{
    const a=harelickPolicyTemplate();const b=harelickPolicyTemplate();b.thresholdCents=50000;mock.rows={'office-a':{payment_policy:a},'office-b':{payment_policy:b}};
    const {result,rerender}=renderHook(()=>useFofPolicySettings(),{wrapper:wrapper()});await waitFor(()=>expect(result.current.data?.payment_policy?.thresholdCents).toBe(100000));
    mock.org='office-b';rerender();await waitFor(()=>expect(result.current.data?.payment_policy?.thresholdCents).toBe(50000));
    mock.org='office-c';rerender();await waitFor(()=>expect(result.current.data?.payment_policy).toBeNull());expect(mock.reads).toEqual(['office-a','office-b','office-c']);
  });
  it('binds writes to authenticated org and discards injected org ids',async()=>{
    const {result}=renderHook(()=>useUpsertFofPolicySettings(),{wrapper:wrapper()});
    await act(async()=>{await result.current.mutateAsync({payment_policy:harelickPolicyTemplate(),org_id:'office-b'} as never);});
    expect(mock.upsert.mock.calls[0][0].org_id).toBe('office-a');
  });
  it('rejects employee policy and procedure writes before contacting the server',async()=>{
    mock.role='employee';const a=renderHook(()=>useUpsertFofPolicySettings(),{wrapper:wrapper()});const b=renderHook(()=>useSavePaymentClassification(),{wrapper:wrapper()});
    await expect(a.result.current.mutateAsync({payment_policy:harelickPolicyTemplate()})).rejects.toThrow('Owner or manager');
    await expect(b.result.current.mutateAsync({code:'D6190',classification:'workup'})).rejects.toThrow('Owner or manager');expect(mock.upsert).not.toHaveBeenCalled();
  });
  it('validates a malformed policy instead of falling back to another office’s defaults',async()=>{
    mock.rows={'office-a':{payment_policy:{version:1}}};const {result}=renderHook(()=>useFofPolicySettings(),{wrapper:wrapper()});await waitFor(()=>expect(result.current.isError).toBe(true));expect(result.current.data).toBeUndefined();
  });
  it('normalizes the procedure code and only writes its payment classification',async()=>{
    const {result}=renderHook(()=>useSavePaymentClassification(),{wrapper:wrapper()});await act(async()=>{await result.current.mutateAsync({code:' d6190 ',classification:'workup'});});expect(mock.upsert.mock.calls[0][0]).toEqual({org_id:'office-a',code:'D6190',payment_class:'workup'});
  });
});
