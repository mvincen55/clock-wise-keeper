import { describe, expect, it } from 'vitest';
import { suggestPaymentClass } from '@/lib/fof/suggest-class';

describe('suggested payment classification from the CDT range', () => {
  it.each([
    ['D0367', 'workup'], ['D0470', 'workup'],
    ['D2740', 'restoration'], ['D2950', 'restoration'],
    ['D5110', 'denture'], ['D5750', 'denture'], ['D5820', 'denture'],
    ['D6010', 'implant'], ['D6011', 'implant'],
    ['D6057', 'restoration'], ['D6059', 'restoration'], ['D6240', 'restoration'],
    ['D2391', 'other'], ['D3330', 'other'], ['D7140', 'other'], ['D4265', 'other'],
    ['9434', 'other'], ['', 'other'],
  ])('%s suggests %s', (code, expected) => {
    expect(suggestPaymentClass(code)).toBe(expected);
  });
});
