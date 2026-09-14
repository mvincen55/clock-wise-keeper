import {renderHook,cleanup} from '@testing-library/react';
import {it,expect,vi,afterEach,beforeEach} from 'vitest';
import {useMissingShifts} from '@/hooks/useMissingShifts';
const state=vi.hoisted(()=>({off:[{type:'unscheduled',date_start:'2026-09-08',date_end:'2026-09-08'}],loading:false}));
vi.mock('@/hooks/usePracticeSettings',()=>({useClocksIn:()=>true}));
vi.mock('@/hooks/useScheduleVersions',()=>({
 useScheduleVersions:()=>({data:[{effective_start_date:'2026-06-07'}]}),
 getVersionForDate:(v:any[],date:string)=>date>='2026-06-07'?v[0]:null,
 getWeekdayRule:(_:any,date:string)=>[1,2,3,5].includes(new Date(date+'T12:00:00').getDay())?{enabled:true,end_time:'17:00'}:null,
}));
vi.mock('@/hooks/useWorkSchedule',()=>({useWorkSchedule:()=>({data:[{enabled:true}]}),getScheduleForWeekday:()=>({enabled:true,end_time:'17:00'})}));
vi.mock('@/hooks/useTimeEntries',()=>({useTimeEntries:()=>({data:state.loading?undefined:['2026-09-04','2026-09-07','2026-09-09','2026-09-11'].map(entry_date=>({entry_date}))})}));
vi.mock('@/hooks/useDaysOff',()=>({useDaysOff:()=>({data:state.off})}));
vi.mock('@/hooks/useOfficeClosures',()=>({useOfficeClosures:()=>({data:[]})}));
vi.mock('@/hooks/useAttendanceExceptions',()=>({useAttendanceExceptions:()=>({data:[]})}));
vi.mock('@/hooks/usePayrollSettings',()=>({usePayrollSettings:()=>({data:{missing_shift_buffer_minutes:60}})}));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));state.off=[{type:'unscheduled',date_start:'2026-09-08',date_end:'2026-09-08'}];state.loading=false;});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('does not flag omitted Thursdays/Saturdays or an already documented day out',()=>{
 const {result}=renderHook(()=>useMissingShifts('2026-09-03','2026-09-12'));expect(result.current).toEqual([]);
});
it('still catches a scheduled day with no work or absence record',()=>{
 state.off=[];const {result}=renderHook(()=>useMissingShifts('2026-09-03','2026-09-12'));expect(result.current.map(d=>d.date)).toEqual(['2026-09-08']);
});
it('does not fall back to an old schedule before the first assigned version',()=>{
 const {result}=renderHook(()=>useMissingShifts('2026-06-01','2026-06-06'));expect(result.current).toEqual([]);
});
it('waits for the time records before warning',()=>{
 state.loading=true;const {result}=renderHook(()=>useMissingShifts('2026-09-03','2026-09-12'));expect(result.current).toEqual([]);
});

