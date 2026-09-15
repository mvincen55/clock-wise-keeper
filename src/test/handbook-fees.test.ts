import { describe, expect, it } from 'vitest';
import {
  codesInCell,
  dollarAmounts,
  feeColumnIndex,
  formatFee,
  isFeeTable,
  liveFeeLabel,
  printedFeeMatches,
} from '@/lib/handbook-fees';

// Synthetic codes and fees only — no office's schedule is reproduced here.
const byCode = new Map<string, number>([
  ['D0120', 6500], ['D2391', 23100], ['D2392', 30000], ['D2393', 38000], ['D2394', 44900],
  ['D4341', 33800], ['D4342', 26400], ['D9944', 81400],
]);

describe('codesInCell', () => {
  it('reads single codes, pairs, ranges, and suffixed office variants', () => {
    expect(codesInCell('D0120')).toEqual(['D0120']);
    expect(codesInCell('D4341 / D4342')).toEqual(['D4341', 'D4342']);
    expect(codesInCell('D2391 - D2394')).toEqual(['D2391', 'D2392', 'D2393', 'D2394']);
    expect(codesInCell('D9944p')).toEqual(['D9944P']);
    expect(codesInCell('1206')).toEqual(['1206']);
    expect(codesInCell('D002')).toEqual(['D002']);
    expect(codesInCell('Bitewings - Two Films')).toEqual([]);
    expect(codesInCell('Updated 4/21/23 for $75')).toEqual([]);
  });
  it('does not expand an implausibly wide range', () => {
    expect(codesInCell('D0100 - D9999')).toEqual(['D0100', 'D9999']);
  });
});

describe('fee tables', () => {
  const rows = [['Code', 'Procedure', 'Office Fee (As of 4.21.23)'], ['D0120', 'Periodic Exam', '$65'], ['D9944p', 'Occlusal Guard - Preventive', '$598']];
  it('recognizes a table with a fee column and codes to look up', () => {
    expect(isFeeTable(rows)).toBe(true);
    expect(feeColumnIndex(rows[0])).toBe(2);
    expect(isFeeTable([['Abbreviation', 'Definition'], ['BWX', 'Bitewings']])).toBe(false);
    expect(isFeeTable([['Code', 'Procedure', 'Office Fee'], ['1206', 'Fluoride Package', '$67']])).toBe(true);
    expect(isFeeTable([['Year', 'Holiday', 'Fee'], ['2026', 'Christmas', '$0']])).toBe(true);
  });
  it('formats whole-dollar fees without cents', () => {
    expect(formatFee(6500)).toBe('$65');
    expect(formatFee(156950)).toBe('$1,569.50');
  });
  it('labels single codes, pairs, and ranges from the live schedule', () => {
    expect(liveFeeLabel(['D0120'], byCode)).toBe('$65');
    expect(liveFeeLabel(['D9944'], byCode)).toBe('$814');
    expect(liveFeeLabel(['D9944P'], byCode)).toBe('$814');
    expect(liveFeeLabel(['D0140M'], new Map([['D0140', 11900], ['D0140M', 5800]]))).toBe('$58');
    expect(liveFeeLabel(['1207'], new Map([['1207', 0]]))).toBe('No charge');
    expect(liveFeeLabel(['D4341', 'D4342'], byCode)).toBe('$338 / $264');
    expect(liveFeeLabel(['D4341', 'D0999'], byCode)).toBe('$338 / —');
    expect(liveFeeLabel(codesInCell('D2391 - D2394'), byCode)).toBe('$231 – $449');
    expect(liveFeeLabel(['D0999'], byCode)).toBeNull();
  });
  it('compares the printed figure with the live label by amount, not formatting', () => {
    expect(dollarAmounts('$7785 - Varies on the case Average is $5-7 k')).toEqual([778500, 500, 700]);
    expect(dollarAmounts('$1,569.50 / $264')).toEqual([156950, 26400]);
    expect(printedFeeMatches('$338 / $264', '$338 / $264')).toBe(true);
    expect(printedFeeMatches('$231-449', '$231 – $449')).toBe(true);
    expect(printedFeeMatches('$598', '$814')).toBe(false);
    expect(printedFeeMatches('No Charge', '$65')).toBe(false);
  });
});
