import { describe, expect, it } from 'vitest';
import { parseTreatmentWords } from '@/lib/fof/local-treatment-import';
import type { OcrWord } from '@/lib/schedule-reader/types';
const word = (text: string, x: number, y: number, confidence = 95): OcrWord => ({ text, confidence, bbox: { x0:x-25, x1:x+25, y0:y, y1:y+20 } });
const header = ['Code', 'Th', 'Description', 'Fee', 'OFFICE', 'Visit', 'Date'].map((text,i)=>word(text,100+i*150,20));
const row = (y: number, code='D2740') => [code,'8','IGNORED_PRIVATE_DESCRIPTION','$900.00','$1,200.00','3','9/9/2026'].map((text,i)=>word(text,100+i*150,y));
describe('local treatment screenshot parser', () => {
  it('reads office and contracted fees from distinct columns and copies no image description', () => {
    const result = parseTreatmentWords([...header,...row(60),...row(100,'D6010')],{D2740:'Crown',D6010:'Implant surgery'});
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({code:'D2740',tooth:'8',description:'Crown',fee:900,officeFee:1200,visit:3,entryDate:'9/9/2026'});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('preserves repeated codes and numeric office codes as distinct rows', () => {
    const result = parseTreatmentWords([...header,...row(60),...row(100),...row(140,'2014')],{D2740:'Crown','2014':'Records'});
    expect(result.rows.map(row=>row.code)).toEqual(['D2740','D2740','2014']);
  });
  it('rejects the entire read when any amount or tooth is uncertain', () => {
    for (const field of [1,3,4]) {
      const second=row(100); second[field].confidence=20;
      expect(()=>parseTreatmentWords([...header,...row(60),...second],{})).toThrow('Nothing was imported');
    }
  });
  it('requires explicit columns and refuses to guess a fee from insurance values', () => {
    expect(()=>parseTreatmentWords(row(60),{})).toThrow();
    const noFeeHeader=header.filter((_,i)=>i!==3&&i!==4);
    const result=parseTreatmentWords([...noFeeHeader,...row(60).filter((_,i)=>i!==3&&i!==4)],{});
    expect(result.rows[0].fee).toBeNull();expect(result.rows[0].officeFee).toBeNull();
    expect(result.warnings.join(' ')).toContain('office fee schedule');
  });
  it('never imports more than the review limit', () => {
    expect(()=>parseTreatmentWords([...header,...Array.from({length:41},(_,i)=>row(60+i*40)).flat()],{})).toThrow();
  });
});
