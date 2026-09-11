import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrivacyViewCapture from '@/components/close-day/PrivacyViewCapture';
const save=vi.hoisted(()=>vi.fn(async()=>{}));
vi.mock('@/hooks/useProviders',()=>({useProviders:()=>({data:[]})}));
vi.mock('@/hooks/useEmployees',()=>({useOrgEmployees:()=>({data:[]})}));
vi.mock('@/hooks/usePracticeSettings',()=>({usePracticeSettings:()=>({data:{mobile_capture_enabled:true}})}));
vi.mock('@/hooks/useScheduleIntelligence',()=>({
 useLayoutProfiles:()=>({data:[{id:'profile',is_default:true}]}), usePhraseRules:()=>({data:[]}), useSaveScheduleMetrics:()=>({mutateAsync:save}),
 toLayoutProfile:()=>({statusLegend:[{status:'completed'},{status:'open'}]}),toClassifierRules:()=>[],
}));
vi.mock('@/lib/schedule-reader',async original=>{
 const lib=await original<typeof import('@/lib/schedule-reader')>();
 return {...lib,captureSupported:()=>false,frameFromFile:async()=>({}),destroyCapture:async()=>{},processScheduleFrame:async()=>({providers:[],blocks:[],rollup:lib.computeRollup([]),layoutConfidence:1,needsReview:false,providerRows:{},minutesPerRow:10})};
});
it('preserves entered Practice Vitals when posted colors hide event history',async()=>{
 const prefill=vi.fn();const {container}=render(<PrivacyViewCapture closeoutId="day" date="2026-09-11" onVitalsFromSchedule={prefill}/>);
 fireEvent.click(screen.getByRole('button',{name:"Capture Today's Schedule"}));
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File([''],'posted.png',{type:'image/png'})]}});
 await screen.findByText(/Those counts remain for manual review/);
 fireEvent.click(screen.getByRole('button',{name:'These numbers are right — save them'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({needsReview:true})));
 expect(prefill).not.toHaveBeenCalled();
 expect(await screen.findByText(/Practice Vitals were preserved/)).toBeInTheDocument();
});
