import { expect, it } from 'vitest';
import { detectAppointmentRegions, columnsFromRegions, isNotesOnlyColumn } from '@/lib/schedule-reader/appointment-regions';
import { readProviderCodeEvidence, readProviderCodes } from '@/lib/schedule-reader/provider-codes';
import { suggestDailyColumns } from '@/lib/schedule-reader/provider-mapping';
import type { OcrWord, LayoutColumn } from '@/lib/schedule-reader/types';
const word = (text:string, y:number, confidence=50, x=101):OcrWord => ({text,confidence,bbox:{x0:x,x1:x+20,y0:y,y1:y+8}});
it('recovers repeated zero/O and two/Z OCR errors, without guessing a single weak hit', () => {
  expect(readProviderCodes([word('DRO2',20,61),word('DROZ',80,45),word('HY11',200,88)])).toEqual(['DR02','HY11']);
  expect(readProviderCodes([word('DROZ',20,45)])).toEqual([]);
  expect(readProviderCodes([word('DROZ',20,45),word('DROZ',21,45)])).toEqual([]);
  expect(readProviderCodes([word('DRILL',20,99),word('DRILL',80,99)])).toEqual([]);
  expect(readProviderCodes([word('DR02',20,20),word('DR02',80,20)])).toEqual([]);
});
it('finds connected appointment boxes without turning blue grid lines or blank lanes into columns', () => {
  const width=500,height=240,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){ const i=(y*width+x)*4; data.set(y%10===0?[170,195,214,255]:[135,172,205,255],i); }
  for(const [x0,y0,x1,y1] of [[20,20,95,70],[20,100,95,170],[320,30,395,130]])for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)data.set([128,128,128,255],(y*width+x)*4);
  const regions=detectAppointmentRegions({width,height,data});
  expect(regions).toHaveLength(3);
  expect(columnsFromRegions(regions,width)).toEqual([{xStart:.04,xEnd:.19},{xStart:.64,xEnd:.79}]);
});
it('uses appointment-code mappings in their current occupied columns and excludes evidenced notes', () => {
  const p={id:'p',displayName:'Dr. Example',providerType:'doctor' as const,employeeId:null,active:true};
  const previous:LayoutColumn[]=[{xStart:.7,xEnd:.9,kind:'provider',providerId:'p',providerCode:'DR02',providerLabel:p.displayName,providerRole:'dentist',department:'doctor',employeeId:null}];
  const regions=[{x0:100,x1:200,y0:10,y1:70},{x0:100,x1:200,y0:80,y1:140},{x0:300,x1:400,y0:10,y1:40}];
  const words=[word('DRO2',20,61),word('DROZ',90,45),word('SENT',20,90,310)];
  const columns=suggestDailyColumns(words,previous,500,240,[p],regions);
  expect(columns).toHaveLength(2);
  expect(columns[0]).toMatchObject({providerId:'p',providerCode:'DR02',xStart:.2});
  expect(columns[1].kind).toBe('non_clinical');
  expect(isNotesOnlyColumn([],regions,{xStart:.6,xEnd:.8},500)).toBe(false);
  expect(previous[0].xStart).toBe(.7);
});

it('uses roster codes before calibration exists and overrides stale layout code mappings', () => {
  const p = {id:'scott',displayName:'Dr. Scott',providerType:'doctor' as const,employeeId:null,active:true,scheduleCode:'DR02'};
  const stale:LayoutColumn = {xStart:0,xEnd:1,kind:'provider',providerId:'old',providerCode:'DR02',providerLabel:'Old',providerRole:'dentist',department:'doctor',employeeId:null};
  const result=suggestDailyColumns([word('DR02',80,99)], [stale], 500,240,[p]);
  expect(result[0].providerId).toBe('scott');
  expect(result[0].providerRole).toBe('dentist');
  expect(suggestDailyColumns([word('DR02',80,99)], [stale],500,240,[{...p,active:false}])[0].providerId).toBeUndefined();
});

it('does not restore old empty lanes when only one occupied column is detected', () => {
  const old:LayoutColumn[]=[0,.5].map(x=>({xStart:x,xEnd:x+.4,kind:'provider',providerLabel:null,providerRole:null,department:null,employeeId:null}));
  const cols=suggestDailyColumns([word('DR02',40,95)],old,500,240,[],[{x0:100,x1:200,y0:20,y1:100}]);
  expect(cols).toHaveLength(1);expect(cols[0].xStart).toBe(.2);
});

it('keeps a coded hold with the same doctor and does not use another doctor from its header', () => {
  const providers=[{id:'scott',displayName:'Dr. Scott',scheduleCode:'DR02',providerType:'doctor' as const,employeeId:null,active:true},{id:'nicole',displayName:'Dr. Nicole',scheduleCode:'DR08',providerType:'doctor' as const,employeeId:null,active:true}];
  const columns:LayoutColumn[]=[0,.5].map(x=>({xStart:x,xEnd:x+.5,kind:'provider',providerLabel:null,providerRole:null,department:null,employeeId:null}));
  const words=[word('DR02',80,99,20),word('Nicole',10,99,300),word('DR08',20,99,300),word('HOLD',80,99,300)];
  const uncoded=suggestDailyColumns(words,columns,500,240,providers);
  expect(uncoded[0].providerId).toBe('scott');
  expect(uncoded[1].kind).toBe('provider');
  expect(uncoded[1].providerId).toBeFalsy();
  const coded=suggestDailyColumns([...words,word('DR02',100,99,300)],columns,500,240,providers);
  expect(coded.map(c=>c.providerId)).toEqual(['scott','scott']);
});

it('folds half-width double bookings into their lane and rejoins split codes', () => {
  // A full-width box and a side-by-side pair in the same operatory are one lane; the next operatory stays its own.
  const regions=[{x0:100,x1:200,y0:10,y1:40},{x0:100,x1:150,y0:50,y1:80},{x0:150,x1:200,y0:50,y1:80},{x0:210,x1:310,y0:10,y1:40}];
  expect(columnsFromRegions(regions,1000)).toEqual([{xStart:.1,xEnd:.2},{xStart:.21,xEnd:.31}]);
  // "DR" and "02" read as two words on one line still count as one clean DR02.
  expect(readProviderCodes([word('DR',20,90,100),{text:'02',confidence:90,bbox:{x0:122,x1:135,y0:20,y1:28}}])).toEqual(['DR02']);
});

it('matches the office vocabulary through OCR slips but never merges distinct clean codes', () => {
  expect(readProviderCodes([word('HY1G',20,70),word('HY1G',80,70)],['HY16'])).toEqual(['HY16']);
  expect(readProviderCodes([word('DR1',20,90),word('DR1',80,90)],['DR01'])).toEqual(['DR01']);
  expect(readProviderCodes([word('HY1G',20,70)],['HY16'])).toEqual([]);
  expect(readProviderCodes([word('DR03',20,99)],['DR02'])).toEqual(['DR03']);
  expect(readProviderCodes([word('DRILL',20,99),word('DRILL',80,99)],['DR11'])).toEqual([]);
  expect(readProviderCodes([word('HY1C',20,90),word('HY1C',80,90)],['HY16','HY10'])).toEqual([]);
  expect(readProviderCodeEvidence([word('HY16',40,99),word('DR02',20,99),word('DR02',60,99)],['DR02','HY16'])).toEqual([{code:'DR02',count:2},{code:'HY16',count:1}]);
});
