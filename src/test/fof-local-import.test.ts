import { describe, expect, it } from 'vitest';
import { parseTreatmentText, parseTreatmentWords, REVIEW_ROW_LIMIT } from '@/lib/fof/local-treatment-import';
import type { OcrWord } from '@/lib/schedule-reader/types';
const word = (text: string, x: number, y: number, confidence = 95): OcrWord => ({ text, confidence, bbox: { x0:x-25, x1:x+25, y0:y, y1:y+20 } });
const header = ['Code', 'Th', 'Description', 'Fee', 'OFFICE', 'Visit', 'Date'].map((text,i)=>word(text,100+i*150,20));
const row = (y: number, code='D2740') => [code,'8','IGNORED_PRIVATE_DESCRIPTION','$900.00','$1,200.00','3','9/9/2026'].map((text,i)=>word(text,100+i*150,y));
describe('local treatment screenshot parser', () => {
  it('reads office and contracted fees from distinct columns and copies no image description', () => {
    const result = parseTreatmentWords([...header,...row(60),...row(100,'D6010')],{D2740:'Crown',D6010:'Implant surgery'});
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({code:'D2740',tooth:'8',description:'Crown',fee:900,officeFee:1200,visit:3,entryDate:'9/9/2026',confidence:'ok',issues:[]});
    expect(result.oversized).toBe(false);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('preserves repeated codes and numeric office codes as distinct rows', () => {
    const result = parseTreatmentWords([...header,...row(60),...row(100),...row(140,'2014')],{D2740:'Crown','2014':'Records'});
    expect(result.rows.map(row=>row.code)).toEqual(['D2740','D2740','2014']);
  });
  it('flags an uncertain amount, tooth or code for review instead of throwing the whole read away', () => {
    for (const field of [0,1,3,4]) {
      const second=row(100); second[field].confidence=20;
      const result=parseTreatmentWords([...header,...row(60),...second],{D2740:'Crown'});
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].confidence).toBe('ok');
      expect(result.rows[1].confidence).toBe('low');
      expect(result.rows[1].issues.length).toBeGreaterThan(0);
      expect(JSON.stringify(result.rows[1].issues)).not.toContain('PRIVATE');
    }
  });
  it('drops an unreadable amount to a hand-entered value with a note, never a silent zero', () => {
    const second=row(100); second[3]=word('9O0.OO',100+3*150,100);
    const result=parseTreatmentWords([...header,...row(60),...second],{});
    expect(result.rows[1].fee).toBeNull();
    expect(result.rows[1].issues.join(' ')).toContain('Fee amount');
  });
  it('flags a code the office does not know instead of dropping it', () => {
    const result=parseTreatmentWords([...header,...row(60,'ZZ99')],{});
    expect(result.rows[0].code).toBe('ZZ99');
    expect(result.rows[0].issues.join(' ')).toContain('not on the office fee schedule');
  });
  it('requires explicit columns and refuses to guess a fee from insurance values', () => {
    expect(()=>parseTreatmentWords(row(60),{})).toThrow();
    const noFeeHeader=header.filter((_,i)=>i!==3&&i!==4);
    const result=parseTreatmentWords([...noFeeHeader,...row(60).filter((_,i)=>i!==3&&i!==4)],{});
    expect(result.rows[0].fee).toBeNull();expect(result.rows[0].officeFee).toBeNull();
    expect(result.warnings.join(' ')).toContain('office fee schedule');
  });
  it('keeps every row of an oversized plan and flags it for batch review rather than discarding rows', () => {
    const result=parseTreatmentWords([...header,...Array.from({length:REVIEW_ROW_LIMIT+1},(_,i)=>row(60+i*40)).flat()],{D2740:'Crown'});
    expect(result.rows).toHaveLength(REVIEW_ROW_LIMIT+1);
    expect(result.oversized).toBe(true);
    expect(result.warnings.join(' ')).toContain(`${REVIEW_ROW_LIMIT}-row review limit`);
  });
});

describe('pasted treatment text parser', () => {
  it('reads code, tooth, amounts and visit headings without copying descriptions', () => {
    const result = parseTreatmentText('Visit 1\nD2740\t#8\tCrown for Ms Private\t$1,569.00\t$1,200.00\nD2950 8 491.00\nVisit 2\nD6010 19 2717.00 Visit 2\nTotal 4777.00', { D2740: 'Porcelain Crown', D2950: 'Core Buildup', D6010: 'Dental Implant' });
    expect(result.rows.map(r => [r.code, r.tooth, r.fee, r.officeFee, r.visit])).toEqual([
      ['D2740', '8', 1569, 1200, 1],
      ['D2950', '8', 491, null, 1],
      ['D6010', '19', 2717, null, 2],
    ]);
    expect(result.rows.map(r => r.description)).toEqual(['Porcelain Crown', 'Core Buildup', 'Dental Implant']);
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(result.warnings.join(' ')).toContain('did not start with a procedure code');
  });
  it('flags unknown codes and refuses text with no procedure lines', () => {
    expect(() => parseTreatmentText('Jane Doe owes $600', {})).toThrow('No procedure lines');
    const result = parseTreatmentText('XZ12 3 100.00', {});
    expect(result.rows[0].issues.join(' ')).toContain('not on the office fee schedule');
  });
});
