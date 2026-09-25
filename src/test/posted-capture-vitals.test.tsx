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
const read=vi.hoisted(()=>({providers:[] as unknown[],blocks:[] as unknown[]}));
vi.mock('@/lib/schedule-reader',async original=>{
 const lib=await original<typeof import('@/lib/schedule-reader')>();
 return {...lib,captureSupported:()=>false,frameFromFile:async()=>({}),destroyCapture:async()=>{},processScheduleFrame:async()=>({providers:read.providers,blocks:read.blocks,rollup:lib.computeRollup(read.providers as never),layoutConfidence:1,needsReview:false,providerRows:{},minutesPerRow:10})};
});
async function capture(){
 const prefill=vi.fn();const {container}=render(<PrivacyViewCapture closeoutId="day" date="2026-09-11" onVitalsFromSchedule={prefill}/>);
 fireEvent.click(screen.getByRole('button',{name:"Capture Today's Schedule"}));
 fireEvent.change(container.querySelector('input[type=file]')!,{target:{files:[new File([''],'posted.png',{type:'image/png'})]}});
 await screen.findByText(/Cancellations and no-shows are not read from the schedule/);
 return prefill;
}
it('leaves cancellations and no-shows to Step 2 when the posted view has no colors for them',async()=>{
 const prefill=await capture();
 fireEvent.click(screen.getByRole('button',{name:'These numbers are right — save them'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({needsReview:false})));
 expect(prefill).not.toHaveBeenCalled();
 expect(await screen.findByText(/Cancellations and no-shows are entered in Step 2/)).toBeInTheDocument();
 expect(screen.queryByText(/Cancels/)).toBeNull();
});
it('shows each provider\'s open, not-here, meeting and other blocked time, not the closed grid',async()=>{
 const provider={providerLabel:'Dr. A',providerRole:'dentist',department:'doctor',employeeId:null,businessDate:'2026-09-11',grossAvailableMinutes:600,intentionalUnavailableMinutes:270,netBookableMinutes:330,scheduledMinutes:220,trueOpenMinutes:110,cancellationCount:0,cancellationOpenMinutes:0,noShowCount:0,noShowOpenMinutes:0,otherOpenMinutes:110,unclassifiedMinutes:0,recoveredMinutes:null,recoveredOpenPct:null,sameDayAdditions:null,overlapMinutes:0,longestBookedStretchMinutes:120,continuousWithoutBufferMinutes:0,activeColumns:1,simultaneousColumnMinutes:0,scheduleDensity:0.6667,scheduleVolatility:0,supportStaffAssigned:null,staffingToColumnRatio:null,automatedWorkloadClass:'steady',confidence:1,reviewStatus:'auto_accepted'};
 const block=(code:string,minutes:number,extra={})=>({code,minutes,providerLabel:'Dr. A',department:'doctor',confidence:0.9,userConfirmed:false,...extra});
 read.providers=[provider];
 read.blocks=[block('PROVIDER_OUT_EARLY',60),block('STAFFING_LIMITATION',30),block('MEETING_BLOCK',45),block('LUNCH_BLOCK',60),block('OTHER_OPERATIONAL_BLOCK',20,{confidence:0.2}),block('PROVIDER_OFF',120,{confidence:1,userConfirmed:true,source:'grid'})];
 await capture();
 const row=screen.getByText('Dr. A').closest('tr')!;
 const cells=[...row.querySelectorAll('td')].map(td=>td.textContent);
 expect(cells).toEqual(['Dr. A','doctor','3h 40m','1h 50m','1h','45m','1h 30m','—']);
 expect(screen.getByText(/Closed on the grid/)).toBeInTheDocument();
});
