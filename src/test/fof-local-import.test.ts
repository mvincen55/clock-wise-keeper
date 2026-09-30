import { describe, expect, it } from 'vitest';
import { CONFIDENCE_FLOOR, normalizeCodeToken, normalizeMoneyToken, ocrScale, parseTreatmentText, parseTreatmentWords, REVIEW_ROW_LIMIT, toGrayscale, visitFromHeading } from '@/lib/fof/local-treatment-import';
import pmsPlanWords from './fixtures/pms-plan-ocr-words.json';
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
  it('drops an unreadable amount to a hand-entered value with a note that quotes what was read, never a silent zero', () => {
    const second=row(100); second[3]=word('9O0.O',100+3*150,100);
    const result=parseTreatmentWords([...header,...row(60),...second],{});
    expect(result.rows[1].fee).toBeNull();
    expect(result.rows[1].issues.join(' ')).toContain('The Fee amount was read as "9O0.O"');
  });
  it('says what was read and how sure the reader was when a cell is below the confidence floor', () => {
    const second=row(100); second[0].confidence=39; second[3].confidence=58; second[1].confidence=50;
    const result=parseTreatmentWords([...header,...row(60),...second],{D2740:'Crown'});
    const issues=result.rows[1].issues.join(' ');
    expect(issues).toContain(`The code D2740 was read at 39% confidence (below ${CONFIDENCE_FLOOR}%)`);
    expect(issues).toContain('The Fee amount "$900.00" was read at 58% confidence');
    expect(issues).toContain('The tooth number "8" was read at 50% confidence');
  });
  it('does not flag a low-confidence code or amount that the office fee schedule corroborates', () => {
    const fees = { D2740: 1200, D6190: 1120, D6191: 800 };
    // Code at 43% and the OFFICE amount at 50%: that amount is the on-file fee, so the row is read right.
    const second = row(100); second[0].confidence = 43; second[4].confidence = 50;
    const result = parseTreatmentWords([...header, ...row(60), ...second], { D2740: 'Crown' }, fees);
    expect(result.rows[1]).toMatchObject({ code: 'D2740', fee: 900, officeFee: 1200, confidence: 'ok', issues: [] });
    // Without the fees nothing is corroborated and every low read is still named.
    const bare = parseTreatmentWords([...header, ...row(60), ...second], { D2740: 'Crown' });
    expect(bare.rows[1].confidence).toBe('low');
    expect(bare.rows[1].issues.join(' ')).toContain('The code D2740 was read at 43% confidence');
    expect(bare.rows[1].issues.join(' ')).toContain('The Office amount "$1,200.00" was read at 50% confidence');
    // A contracted Fee amount the schedule knows nothing about stays flagged even on a corroborated row.
    const contracted = row(100); contracted[0].confidence = 43; contracted[3].confidence = 50;
    const partial = parseTreatmentWords([...header, ...row(60), ...contracted], { D2740: 'Crown' }, fees);
    expect(partial.rows[1].issues).toEqual(['The Fee amount "$900.00" was read at 50% confidence (below 65%); compare it with the screenshot.']);
    // The plain Fee column corroborates only when the plan has no OFFICE column.
    const plainHeader = header.filter((_, i) => i !== 4);
    const plainRow = row(100).filter((_, i) => i !== 4); plainRow[0].confidence = 43;
    expect(parseTreatmentWords([...plainHeader, ...plainRow], { D2740: 'Crown' }, { D2740: 900 }).rows[0]).toMatchObject({ confidence: 'ok', issues: [] });
    expect(parseTreatmentWords([...plainHeader, ...plainRow], { D2740: 'Crown' }, { D2740: 950 }).rows[0].confidence).toBe('low');
  });
  it('never corroborates a corrected, unknown, $0 or differing-fee code, nor one whose one-character neighbour costs the same', () => {
    const low = (code: string, office: string) => { const r = row(100, code); r[0].confidence = 43; r[4] = word(office, 100 + 4 * 150, 100); return r; };
    const names = { D2740: 'Crown', D6058: 'Implant crown', D6059: 'Implant crown', D0367: 'Cone beam' };
    const fees = { D2740: 1200, D6058: 1927, D6059: 1927, D0367: 520, D0368: 0 };
    const lowIssue = (rows: ReturnType<typeof parseTreatmentWords>['rows']) => rows[0].issues.join(' ');
    // Corrected code: the read text differed from the code, so it is always named.
    expect(lowIssue(parseTreatmentWords([...header, ...low('D274O', '$1,200.00')], names, fees).rows)).toContain('corrected to D2740');
    // Unknown code: the schedule cannot vouch for it.
    expect(lowIssue(parseTreatmentWords([...header, ...low('D9999', '$1,200.00')], names, fees).rows)).toContain('was read at 43% confidence');
    // Fee differs from the schedule.
    expect(lowIssue(parseTreatmentWords([...header, ...low('D2740', '$1,250.00')], names, fees).rows)).toContain('was read at 43% confidence');
    // $0 on file vouches for nothing.
    expect(lowIssue(parseTreatmentWords([...header, ...low('D0368', '$0.00')], { ...names, D0368: 'Cone beam' }, fees).rows)).toContain('was read at 43% confidence');
    // D6059 costs the same as D6058, so the amount cannot tell them apart.
    expect(lowIssue(parseTreatmentWords([...header, ...low('D6058', '$1,927.00')], names, fees).rows)).toContain('The code D6058 was read at 43% confidence');
    // D0367 at $520 has no same-priced neighbour: corroborated.
    expect(parseTreatmentWords([...header, ...low('D0367', '$520.00')], names, fees).rows[0]).toMatchObject({ confidence: 'ok', issues: [] });
  });
  it('corrects OCR letter-for-digit confusions in codes, amounts, teeth and dates, and says so for codes', () => {
    expect(normalizeCodeToken('D6O58')).toEqual({ code: 'D6058', corrected: true });
    expect(normalizeCodeToken('06057')).toEqual({ code: 'D6057', corrected: true });
    expect(normalizeCodeToken('06057', { '06057': 'Office code' })).toEqual({ code: '06057', corrected: false });
    expect(normalizeCodeToken('2014')).toEqual({ code: '2014', corrected: false });
    expect(normalizeCodeToken('|D2740')).toEqual({ code: 'D2740', corrected: false });
    expect(normalizeCodeToken('Custom')).toEqual({ code: 'CUSTOM', corrected: false });
    expect(normalizeMoneyToken('$1,141.00')).toBe(1141);
    expect(normalizeMoneyToken('1.141.00')).toBe(1141);
    expect(normalizeMoneyToken('1,141,00')).toBe(1141);
    expect(normalizeMoneyToken('l,927.OO')).toBe(1927);
    expect(normalizeMoneyToken('1141')).toBeNull();
    expect(normalizeMoneyToken('abc')).toBeNull();
    const second=row(100,'D6O58'); second[1]=word('l9',100+150,100); second[6]=word('6/24/2O24',100+6*150,100);
    const result=parseTreatmentWords([...header,...row(60),...second],{});
    expect(result.rows[1]).toMatchObject({ code:'D6058', tooth:'19', entryDate:'6/24/2024', confidence:'low' });
    expect(result.rows[1].issues.join(' ')).toContain('The code was read as "D6O58" and corrected to D6058');
  });
  it('reads a real PMS grid: rows right under the header, "Visit1" headings, icon glyphs beside cells, and the Entry Date column', () => {
    const result=parseTreatmentWords(pmsPlanWords as OcrWord[],{});
    expect(result.rows.map(r=>[r.code,r.tooth,r.visit,r.fee,r.officeFee,r.entryDate,r.confidence])).toEqual([
      ['D6057','3',1,1141,1141,'6/24/2024','ok'],
      ['D6058','3',1,1927,1927,'6/24/2024','ok'],
      ['D6057','19',null,1141,1141,'6/24/2024','ok'],
      ['D6058','19',null,1927,1927,'6/24/2024','ok'],
      ['D6057','20',null,1141,1141,'6/24/2024','ok'],
      ['D6058','20',null,1927,1927,'6/24/2024','ok'],
      ['D6057','30',null,1141,1141,'6/24/2024','ok'],
      ['D6058','30',null,1927,1927,'6/24/2024','ok'],
    ]);
    expect(result.rows.every(r=>r.issues.length===0)).toBe(true);
    expect(result.warnings).toEqual([]);
    // Descriptions come from the office code bank, never from the image.
    expect(JSON.stringify(result)).not.toMatch(/abutment|porc/i);
  });
  it('turns section headings into visit numbers and leaves "Visit Not Set" open', () => {
    expect(visitFromHeading(['\\Visit1'])).toBe(1);
    expect(visitFromHeading(['Visit','#','2'])).toBe(2);
    expect(visitFromHeading(['(®','Visit','Not','Set'])).toBeNull();
    expect(visitFromHeading(['Visit','Not','Set'])).toBeNull();
    expect(visitFromHeading(['Totals'])).toBeUndefined();
  });
  it('enlarges small captures for the reader within the pixel budget and flattens colour to gray', () => {
    expect(ocrScale(1118,265)).toBe(2);
    expect(ocrScale(600,200)).toBe(3);
    expect(ocrScale(4000,3000)).toBe(1);
    expect(ocrScale(2400,2000)).toBeCloseTo(1.58,2);
    const pixels=new Uint8ClampedArray([255,0,0,255, 0,0,255,255]);
    toGrayscale(pixels);
    expect([...pixels]).toEqual([76,76,76,255, 29,29,29,255]);
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
