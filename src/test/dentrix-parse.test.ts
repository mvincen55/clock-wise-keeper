import { describe, it, expect } from 'vitest';
import {
  parseDentrixAddress,
  parseDentrixAppointments,
} from '@/lib/broken-appts/dentrix-parse';

// The Dentrix panel parsers behind the capture assistant. OCR is an
// assistant, not the source of truth: uncertain values are flagged for the
// employee, never guessed; a missing Address Line 2 is never invented.

const TODAY = new Date(2026, 7, 7); // Aug 7, 2026

describe('parseDentrixAddress', () => {
  it('parses the plain two-line panel (no line 2)', () => {
    const a = parseDentrixAddress(['16 Hiller Avenue', 'Fairhaven, MA 02719']);
    expect(a.addressLine1).toBe('16 Hiller Avenue');
    expect(a.addressLine2).toBe('');
    expect(a.city).toBe('Fairhaven');
    expect(a.state).toBe('MA');
    expect(a.zip).toBe('02719');
    expect(a.uncertain).toEqual([]);
  });

  it('drops the panel header and handles the second sample address', () => {
    const a = parseDentrixAddress(['Address', '11 Shoreview ave', 'Mattapoisett, MA 02739']);
    expect(a.addressLine1).toBe('11 Shoreview ave');
    expect(a.addressLine2).toBe('');
    expect(a.city).toBe('Mattapoisett');
    expect(a.zip).toBe('02739');
  });

  it('a unit line between street and city becomes Address Line 2', () => {
    for (const unit of ['Apt 3B', 'Unit 4', 'Building C', 'Suite 2']) {
      const a = parseDentrixAddress(['16 Hiller Avenue', unit, 'Fairhaven, MA 02719']);
      expect(a.addressLine1).toBe('16 Hiller Avenue');
      expect(a.addressLine2).toBe(unit);
      expect(a.city).toBe('Fairhaven');
    }
  });

  it('two-word cities keep both words', () => {
    const a = parseDentrixAddress(['9 Oak St', 'New Bedford, MA 02740']);
    expect(a.city).toBe('New Bedford');
    expect(a.state).toBe('MA');
  });

  it('flags a misread ZIP instead of guessing the character', () => {
    const a = parseDentrixAddress(['11 Shoreview Ave', 'Mattapoisett, MA 0273?']);
    expect(a.zip).toBe('0273?');
    expect(a.uncertain).toContain('zip');
  });

  it('with no recognizable city line, flags instead of inventing fields', () => {
    const a = parseDentrixAddress(['16 Hiller Avenue', 'Fairhaven Massachusetts']);
    expect(a.addressLine1).toBe('16 Hiller Avenue');
    expect(a.uncertain).toEqual(expect.arrayContaining(['city', 'state', 'zip']));
  });

  it('strips OCR gutter markers from lines', () => {
    const a = parseDentrixAddress(['> 16 Hiller Avenue', '| Fairhaven, MA 02719']);
    expect(a.addressLine1).toBe('16 Hiller Avenue');
    expect(a.city).toBe('Fairhaven');
  });

  it('an empty capture yields blanks flagged for entry', () => {
    const a = parseDentrixAddress([]);
    expect(a.addressLine1).toBe('');
    expect(a.addressLine2).toBe('');
  });
});

describe('parseDentrixAppointments', () => {
  it('parses a future row: date, time, provider code', () => {
    const { rows } = parseDentrixAppointments(['2/19/2027  Friday, 8:40 AM  HY14'], TODAY);
    expect(rows).toEqual([{ date: '2027-02-19', time: '8:40 AM', provider: 'HY14' }]);
  });

  it('filters past appointments out and counts them', () => {
    const lines = [
      '2/15/2027  Monday, 4:00 PM  HY14',
      '8/7/2026  Friday, 3:00 PM  DR08', // today — not upcoming
      '9/3/2025  Wednesday, 10:00  DR05',
      '6/10/2024  Monday, 4:10 PM  HY14',
    ];
    const { rows, pastRowsSkipped } = parseDentrixAppointments(lines, TODAY);
    expect(rows).toEqual([{ date: '2027-02-15', time: '4:00 PM', provider: 'HY14' }]);
    expect(pastRowsSkipped).toBe(3);
  });

  it('parses several future rows and sorts soonest-first', () => {
    const lines = [
      '2/19/2027  Friday, 8:40 AM  HY14',
      '8/7/2026  Friday, 3:00 PM  DR08',
      '7/31/2026  Friday, 8:40 AM  DR08',
    ];
    const { rows } = parseDentrixAppointments(lines, new Date(2026, 6, 1));
    expect(rows.map(r => r.date)).toEqual(['2026-07-31', '2026-08-07', '2027-02-19']);
    expect(rows[0].provider).toBe('DR08');
  });

  it('skips header and gutter lines without dates', () => {
    const lines = ['Appointments  Time  Prov  Lab Case', '2/19/2027  Friday, 8:40 AM  HY14'];
    const { rows } = parseDentrixAppointments(lines, TODAY);
    expect(rows).toHaveLength(1);
  });

  it('a truncated time (no AM/PM) is returned as-is for the employee to fix', () => {
    const { rows } = parseDentrixAppointments(['9/3/2027  Wednesday, 10:00  DR05'], TODAY);
    expect(rows[0].time).toBe('10:00');
    expect(rows[0].provider).toBe('DR05');
  });

  it('a row with no readable provider leaves the cell blank, never invented', () => {
    const { rows } = parseDentrixAppointments(['2/19/2027  Friday, 8:40 AM'], TODAY);
    expect(rows[0].provider).toBe('');
  });

  it('two-digit years resolve to 20xx', () => {
    const { rows } = parseDentrixAppointments(['2/15/27  Monday, 4:00 PM  HY14'], TODAY);
    expect(rows[0].date).toBe('2027-02-15');
  });
});
