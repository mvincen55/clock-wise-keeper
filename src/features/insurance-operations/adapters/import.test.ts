import { describe, expect, it } from 'vitest';
import { readTable } from './import';

describe('local table import', () => {
  it('preserves leading zeros and ambiguous dates for staff review', () => {
    const table = readTable(
      'memberId,groupRaw,birthDate\n00001,00042,01/02/1990',
    );
    expect(table.rows[0]).toEqual(['00001', '00042', '01/02/1990']);
    expect(table.warnings.join(' ')).toContain('YYYY-MM-DD');
  });
  it('handles quoted delimiters without shifting identifiers', () => {
    expect(
      readTable('patientName,memberId\n"Example, Synthetic",00001').rows[0],
    ).toEqual(['Example, Synthetic', '00001']);
  });
  it('rejects batches exceeding the review bound', () => {
    expect(() =>
      readTable('memberId\n' + Array(201).fill('00001').join('\n')),
    ).toThrow();
  });
});
