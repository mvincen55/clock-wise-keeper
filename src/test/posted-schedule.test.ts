import { expect, it } from 'vitest';
import { applyCompletedEvidence, sufficientStatusLegend } from '@/lib/schedule-reader/completed-evidence';
import { buildProviderMetrics, reduceRow } from '@/lib/schedule-reader/metrics-builder';
import { computeRollup, refereeMetrics } from '@/lib/schedule-reader/metrics-referee';
import type { LayoutColumn, OcrWord, StatusLegendEntry, ClassifiedBlock } from '@/lib/schedule-reader/types';
const entry=(status:StatusLegendEntry['status']):StatusLegendEntry=>({status,r:128,g:128,b:128,tolerance:10});
it('allows completed and open for a posted day without requiring scheduled',()=>{
 expect(sufficientStatusLegend({completed:entry('completed'),open:entry('open')})).toBe(true);
 expect(sufficientStatusLegend({scheduled:entry('scheduled'),open:entry('open')})).toBe(true);
 expect(sufficientStatusLegend({completed:entry('completed')})).toBe(false);
 expect(sufficientStatusLegend({open:entry('open'),blocked:entry('blocked')})).toBe(false);
});
it('separates a gray completed appointment, gray lunch, and an ambiguous gray note',()=>{
 const col:LayoutColumn & {pxStart:number;pxEnd:number}={xStart:0,xEnd:1,pxStart:0,pxEnd:100,kind:'provider',providerCode:'DR02',providerLabel:'Dr. Test',providerRole:'dentist',department:'doctor',employeeId:null};
 const rows=Array.from({length:4},(_,i)=>({yTop:i*20,yBottom:(i+1)*20}));
 const regions=rows.slice(0,3).map(r=>({x0:0,x1:100,y0:r.yTop,y1:r.yBottom}));
 const words:OcrWord[]=['DRO2','Lunch','Call'].map((text,i)=>({text,confidence:90,bbox:{x0:5,x1:40,y0:i*20+2,y1:i*20+10}}));
 const result=applyCompletedEvidence(['completed','completed','completed','open'],rows,regions,words,col,[]);
 expect(result).toEqual(['completed','blocked',null,'open']);
 const blocks:ClassifiedBlock[]=[{code:'LUNCH_BLOCK',minutes:20,providerLabel:'Dr. Test',department:'doctor',confidence:1,userConfirmed:false}];
 const metrics=buildProviderMetrics({providerLabel:'Dr. Test',providerRole:'dentist',department:'doctor',employeeId:null,businessDate:'2026-09-11',rows:result.map(s=>reduceRow([s])),minutesPerRow:20,activeColumns:1,blocks,supportStaffAssigned:null,ocrConfidence:1,layoutConfidence:1});
 expect(metrics.scheduledMinutes).toBe(20); expect(metrics.intentionalUnavailableMinutes).toBe(20); expect(metrics.unclassifiedMinutes).toBe(20);
 expect(refereeMetrics({providers:[metrics],blocks,rollup:computeRollup([metrics])}).ok).toBe(true);
 expect(applyCompletedEvidence(['completed'],[rows[0]],[],words,col,[])).toEqual([null]);
});
