/**
 * Missed appointments: pasted Dentrix text becomes postings that carry a
 * date, a code, and a provider and nothing about a patient; providers map
 * to the registry; identical postings are numbered so re-imports add
 * nothing; summaries add up.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultMissedAppointmentRange,
  defaultProviderChoices,
  formatMonthLabel,
  matchMissedAppointmentProvider,
  normalizeDentrixDate,
  parseDentrixMissedAppointments,
  planMissedAppointmentImport,
  providerLabelCounts,
  summarizeMissedAppointments,
  type MissedAppointmentEvent,
  type MissedAppointmentProviderRef,
} from '@/lib/missed-appointments';

const providers: MissedAppointmentProviderRef[] = [
  { id: 'scott', displayName: 'Dr. Scott', providerType: 'doctor', scheduleCode: 'DR02', active: true },
  { id: 'jennie', displayName: 'Dr. Jennie', providerType: 'doctor', scheduleCode: 'DR05', active: true },
  { id: 'robert', displayName: 'Dr. Robert', providerType: 'doctor', scheduleCode: 'DR07', active: true },
  { id: 'nicole', displayName: 'Dr. Nicole', providerType: 'doctor', scheduleCode: 'DR08', active: true },
  { id: 'natalie', displayName: 'Dr. Natalie', providerType: 'doctor', scheduleCode: 'DR03', active: true },
  { id: 'cori', displayName: 'Cori', providerType: 'hygienist', scheduleCode: 'HY14', active: true },
  { id: 'lucia', displayName: 'Lucia', providerType: 'hygienist', scheduleCode: 'HY10', active: true },
  { id: 'molly', displayName: 'Molly', providerType: 'hygienist', scheduleCode: 'HY16', active: true },
  { id: 'temp', displayName: 'Temp Hyg', providerType: 'hygienist', scheduleCode: 'HY11', active: true },
];

const ALLOWED_INSERT_KEYS = ['org_id', 'business_date', 'code', 'provider_name', 'provider_id', 'department', 'primary_provider_code', 'ordinal', 'source', 'imported_by'].sort();

describe('normalizeDentrixDate', () => {
  it('reads US and ISO dates and rejects impossible ones', () => {
    expect(normalizeDentrixDate('9/8/2025')).toBe('2025-09-08');
    expect(normalizeDentrixDate('12/23/2025')).toBe('2025-12-23');
    expect(normalizeDentrixDate('2/7/26')).toBe('2026-02-07');
    expect(normalizeDentrixDate('2026-01-19')).toBe('2026-01-19');
    expect(normalizeDentrixDate('2/30/2026')).toBeNull();
    expect(normalizeDentrixDate('13/1/2026')).toBeNull();
    expect(normalizeDentrixDate('Lucia Bizarro')).toBeNull();
  });
});

describe('parseDentrixMissedAppointments — appointment export', () => {
  it('keeps date, provider, and ProvID from the four-column export and drops PatID by name', () => {
    const text = [
      'Appt_Date\tAppt_Provider\tPatID\tProvID',
      '1/13/2026\tScott L. Harelick\t13943\tDR02',
      '10/9/2025\tLucia Bizarro\t16330\tDR05',
      '',
      '9/17/2025\tHolli Braga\t14621\tDR02',
    ].join('\n');
    const parsed = parseDentrixMissedAppointments(text);
    expect(parsed.format).toBe('appointment_export');
    expect(parsed.lineCount).toBe(4);
    expect(parsed.rows).toEqual([
      { line: 2, business_date: '2026-01-13', code: null, provider_label: 'Scott L. Harelick', primary_provider_code: 'DR02' },
      { line: 3, business_date: '2025-10-09', code: null, provider_label: 'Lucia Bizarro', primary_provider_code: 'DR05' },
      { line: 5, business_date: '2025-09-17', code: null, provider_label: 'Holli Braga', primary_provider_code: 'DR02' },
    ]);
    expect(parsed.droppedColumns).toEqual(['PatID']);
    expect(JSON.stringify(parsed)).not.toContain('13943');
    expect(parsed.skipped).toEqual([]);
  });

  it('reads the two-column export with or without its header', () => {
    const withHeader = parseDentrixMissedAppointments('Appt_Date\tAppt_Provider\n9/8/2025\tScott L. Harelick\n9/8/2025\tScott L. Harelick\n');
    expect(withHeader.rows.map(r => [r.business_date, r.provider_label, r.primary_provider_code])).toEqual([
      ['2025-09-08', 'Scott L. Harelick', null], ['2025-09-08', 'Scott L. Harelick', null],
    ]);
    const bare = parseDentrixMissedAppointments('9/8/2025\tCori Fernandes\n10/22/2025\tLucia Bizarro');
    expect(bare.rows.map(r => r.provider_label)).toEqual(['Cori Fernandes', 'Lucia Bizarro']);
    expect(bare.droppedColumns).toEqual([]);
  });

  it('peels trailing IDs off single-space rows and drops the numeric one', () => {
    const parsed = parseDentrixMissedAppointments('1/13/2026 Scott L. Harelick 13943 DR02\n8/26/2026 Molly Perry\n2/20/2026 Hygienist TEMPORARY 11946 DR02');
    expect(parsed.rows.map(r => [r.provider_label, r.primary_provider_code])).toEqual([
      ['Scott L. Harelick', 'DR02'], ['Molly Perry', null], ['Hygienist TEMPORARY', 'DR02'],
    ]);
    expect(parsed.droppedColumns).toEqual(['patient ID']);
    expect(JSON.stringify(parsed.rows)).not.toContain('13943');
  });

  it('reads a comma-separated export and a code column when one is present', () => {
    const parsed = parseDentrixMissedAppointments('Appt_Date,Appt_Provider,Code\n9/8/2025,Cori Fernandes,9101\n9/9/2025,Cori Fernandes,9100');
    expect(parsed.rows.map(r => r.code)).toEqual(['9101', '9100']);
    const bare = parseDentrixMissedAppointments('9/8/2025\tCori Fernandes\t9101');
    expect(bare.rows[0].code).toBe('9101');
  });

  it('skips lines without a date or provider, by line number only', () => {
    const parsed = parseDentrixMissedAppointments('Appt_Date\tAppt_Provider\nnot a date\tSomeone Secret\n9/8/2025\t\n9/9/2025\tCori Fernandes');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.skipped).toEqual([{ line: 2, reason: 'no date' }, { line: 3, reason: 'no provider' }]);
    expect(JSON.stringify(parsed.skipped)).not.toContain('Secret');
  });

  it('returns an empty result for an empty paste', () => {
    expect(parseDentrixMissedAppointments('  \n\n').format).toBe('empty');
  });
});

describe('parseDentrixMissedAppointments — day sheet', () => {
  const sheet = [
    'DAY SHEET (ALPHABETICAL)',
    'HARELICK DENTAL ASSOCIATES, LLC',
    '09/07/2026 - 09/21/2026',
    'Entry Date | Procedure Date | Patient Name | Th | Code | Description | Charges | BT | Prov Phone #',
    '09/08/2026 | 09/08/2026 Example, Patient | D0120 | Periodic oral evaluation | 41.30 | 1 | DR02 (401)555-0100',
    '09/08/2026 | 09/08/2026 Example, Patient | 9101 | CANCELLATION W/OUT NOTICE | 75.00 | 1 | HY11 (508)555-9100',
    '09/08/2026 | 09/08/2026 Example, Patient | -Courtesy Credit | -75.00 | 1 | HY11 (508)555-9100',
    '09/08/2026 | 09/08/2026 Sample, Person | 9100 | NO SHOW | 75.00 | 1 | HY14 ( | )',
    '09/09/2026 | 09/08/2026 Other, Person | 9101 | CANCELLATION W/OUT NOTICE | 0.00 | 1 | DR02 (508)555-0101',
    '09/10/2026 | 09/10/2026 Nobody, Here | 9101 | CANCELLATION W/OUT NOTICE | 0.00 | 1',
    'Audit #: 9100',
  ].join('\n');

  it('keeps only the posting lines, with the procedure date, the code, and the provider ID', () => {
    const parsed = parseDentrixMissedAppointments(sheet);
    expect(parsed.format).toBe('day_sheet');
    expect(parsed.rows).toEqual([
      { line: 6, business_date: '2026-09-08', code: '9101', provider_label: 'HY11', primary_provider_code: null },
      { line: 8, business_date: '2026-09-08', code: '9100', provider_label: 'HY14', primary_provider_code: null },
      { line: 9, business_date: '2026-09-08', code: '9101', provider_label: 'DR02', primary_provider_code: null },
    ]);
    // The line with a code but no provider ID is skipped by number; the audit line has no date.
    expect(parsed.skipped).toEqual([{ line: 10, reason: 'no provider ID' }, { line: 11, reason: 'no date' }]);
    const serialized = JSON.stringify(parsed);
    for (const name of ['Example', 'Sample', 'Nobody', '555', '41.30', '75.00']) expect(serialized).not.toContain(name);
  });

  it('does not mistake amounts, phone numbers, or procedure codes for a posting code', () => {
    const parsed = parseDentrixMissedAppointments('DAY SHEET\n09/08/2026 | 09/08/2026 A, B | D9100 | Something | 9100.00 | 1 | DR02 (508)555-9100');
    expect(parsed.rows).toEqual([]);
  });
});

describe('matchMissedAppointmentProvider', () => {
  it('matches every Dentrix export name to the registry, and an unknown name to nobody', () => {
    const expected: Record<string, string | null> = {
      'Lucia Bizarro': 'lucia', 'Cori Fernandes': 'cori', 'Jennie Leikin': 'jennie', 'Scott L. Harelick': 'scott',
      'Hygienist TEMPORARY': 'temp', 'Robert N. Harelick': 'robert', 'Molly Perry': 'molly', 'Nicole V. Balthazar': 'nicole',
      'Natalie Harelick': 'natalie', 'Holli Braga': null,
    };
    for (const [label, id] of Object.entries(expected)) {
      expect(matchMissedAppointmentProvider(label, providers)?.id ?? null, label).toBe(id);
    }
  });

  it('matches a day-sheet provider ID by schedule code', () => {
    expect(matchMissedAppointmentProvider('HY14', providers)?.id).toBe('cori');
    expect(matchMissedAppointmentProvider('dr05', providers)?.id).toBe('jennie');
    expect(matchMissedAppointmentProvider('HDA1', providers)).toBeNull();
  });

  it('leaves a tie for the manager instead of guessing', () => {
    const twoScotts = [...providers, { id: 'scott2', displayName: 'Dr. Scott', providerType: 'doctor', scheduleCode: null, active: true }];
    expect(matchMissedAppointmentProvider('Scott L. Harelick', twoScotts)).toBeNull();
    const oneRetired = [...providers, { id: 'scott2', displayName: 'Dr. Scott', providerType: 'doctor', scheduleCode: null, active: false }];
    expect(matchMissedAppointmentProvider('Scott L. Harelick', oneRetired)?.id).toBe('scott');
  });

  it('builds default choices with the registry name and department, counting labels most-frequent first', () => {
    const parsed = parseDentrixMissedAppointments('9/8/2025\tLucia Bizarro\n9/9/2025\tLucia Bizarro\n9/9/2025\tScott L. Harelick\n9/9/2025\tHolli Braga');
    const choices = defaultProviderChoices(parsed.rows, providers);
    expect(choices['Lucia Bizarro']).toEqual({ providerId: 'lucia', providerName: 'Lucia', department: 'hygiene', matched: true });
    expect(choices['Scott L. Harelick']).toEqual({ providerId: 'scott', providerName: 'Dr. Scott', department: 'doctor', matched: true });
    expect(choices['Holli Braga']).toEqual({ providerId: null, providerName: 'Holli Braga', department: 'other', matched: false });
    expect(providerLabelCounts(parsed.rows)).toEqual([
      { label: 'Lucia Bizarro', count: 2 }, { label: 'Holli Braga', count: 1 }, { label: 'Scott L. Harelick', count: 1 },
    ]);
  });
});

describe('planMissedAppointmentImport', () => {
  const text = 'Appt_Date\tAppt_Provider\tPatID\tProvID\n1/19/2026\tLucia Bizarro\t1\tDR05\n1/19/2026\tLucia Bizarro\t2\tDR02\n1/19/2026\tLucia Bizarro\t3\tDR02\n1/20/2026\tCori Fernandes\t4\tDR02';
  const parsed = parseDentrixMissedAppointments(text);
  const choices = defaultProviderChoices(parsed.rows, providers);
  const base = { rows: parsed.rows, code: '9101' as const, choices, orgId: 'office', userId: 'megan', newDaysOnly: false };

  it('numbers identical postings in a stable order and carries only the allowed columns', () => {
    const plan = planMissedAppointmentImport({ ...base, existing: [] });
    expect(plan.inserts.map(i => [i.business_date, i.provider_name, i.ordinal, i.primary_provider_code])).toEqual([
      ['2026-01-19', 'Lucia', 1, 'DR02'], ['2026-01-19', 'Lucia', 2, 'DR02'], ['2026-01-19', 'Lucia', 3, 'DR05'], ['2026-01-20', 'Cori', 1, 'DR02'],
    ]);
    for (const row of plan.inserts) {
      expect(Object.keys(row).sort()).toEqual(ALLOWED_INSERT_KEYS);
      expect(row).toMatchObject({ org_id: 'office', code: '9101', department: 'hygiene', source: 'dentrix_import', imported_by: 'megan' });
    }
    expect(plan.inserts[0].provider_id).toBe('lucia');
    expect(plan.byCode).toEqual({ '9100': 0, '9101': 4 });
    expect(plan.days).toEqual(['2026-01-19', '2026-01-20']);
  });

  it('adds nothing when the same paste is imported again, and only the extra posting from a longer one', () => {
    const first = planMissedAppointmentImport({ ...base, existing: [] });
    const again = planMissedAppointmentImport({ ...base, existing: first.inserts });
    expect(again.inserts).toEqual([]);
    expect(again.alreadyRecorded).toBe(4);
    const longer = parseDentrixMissedAppointments(text + '\n1/20/2026\tCori Fernandes\t5\tDR02');
    const more = planMissedAppointmentImport({ ...base, rows: longer.rows, choices: defaultProviderChoices(longer.rows, providers), existing: first.inserts });
    expect(more.inserts.map(i => [i.business_date, i.provider_name, i.ordinal])).toEqual([['2026-01-20', 'Cori', 2]]);
  });

  it('with newDaysOnly, leaves every day that already has postings alone', () => {
    const existing = [{ business_date: '2026-01-19', code: '9100' as const, provider_name: 'Dr. Scott', ordinal: 1 }];
    const plan = planMissedAppointmentImport({ ...base, existing, newDaysOnly: true });
    expect(plan.inserts.map(i => i.business_date)).toEqual(['2026-01-20']);
    expect(plan.skippedForRecordedDays).toBe(3);
    expect(plan.recordedDaysSkipped).toEqual(['2026-01-19']);
  });

  it('takes the code from the line when the paste is a day sheet', () => {
    const sheet = parseDentrixMissedAppointments('DAY SHEET\n09/08/2026 | 09/08/2026 X, Y | 9100 | NO SHOW | 75.00 | 1 | HY14 ( | )\n09/08/2026 | 09/08/2026 X, Y | 9101 | CANCELLATION W/OUT NOTICE | 0.00 | 1 | DR02 ( | )');
    const plan = planMissedAppointmentImport({ ...base, rows: sheet.rows, choices: defaultProviderChoices(sheet.rows, providers), existing: [] });
    expect(plan.inserts.map(i => [i.code, i.provider_name, i.department])).toEqual([['9100', 'Cori', 'hygiene'], ['9101', 'Dr. Scott', 'doctor']]);
  });

  it('records an unmatched label under its own name and Other', () => {
    const rows = parseDentrixMissedAppointments('9/17/2025\tHolli Braga').rows;
    const plan = planMissedAppointmentImport({ ...base, rows, choices: {}, existing: [] });
    expect(plan.inserts[0]).toMatchObject({ provider_name: 'Holli Braga', provider_id: null, department: 'other' });
  });
});

describe('summaries', () => {
  const ev = (over: Partial<MissedAppointmentEvent>): MissedAppointmentEvent => ({
    id: Math.random().toString(36).slice(2), org_id: 'office', business_date: '2025-09-08', code: '9100', provider_name: 'Lucia',
    provider_id: 'lucia', department: 'hygiene', primary_provider_code: null, ordinal: 1, source: 'dentrix_import', imported_by: null,
    created_at: '', updated_at: '', ...over,
  });

  it('adds up by month, department, and provider, newest month first and busiest provider first', () => {
    const events = [
      ev({}), ev({ ordinal: 2 }), ev({ code: '9101' }),
      ev({ business_date: '2025-10-30', provider_name: 'Dr. Scott', provider_id: 'scott', department: 'doctor' }),
      ev({ business_date: '2025-10-30', code: '9101', provider_name: 'Holli Braga', provider_id: null, department: 'other' }),
    ];
    const s = summarizeMissedAppointments(events);
    expect(s.totals).toEqual({ noShows: 3, lateCancels: 2, doctor: 1, hygiene: 3, other: 1, total: 5, days: 2 });
    expect(s.byMonth).toEqual([
      { month: '2025-10', label: 'Oct 2025', noShows: 1, lateCancels: 1, doctor: 1, hygiene: 0, other: 1, total: 2 },
      { month: '2025-09', label: 'Sep 2025', noShows: 2, lateCancels: 1, doctor: 0, hygiene: 3, other: 0, total: 3 },
    ]);
    expect(s.byProvider.map(p => [p.providerName, p.total])).toEqual([['Lucia', 3], ['Dr. Scott', 1], ['Holli Braga', 1]]);
  });

  it('labels months and picks the last twelve months as the default range', () => {
    expect(formatMonthLabel('2026-01')).toBe('Jan 2026');
    expect(defaultMissedAppointmentRange('2026-09-21')).toEqual({ start: '2025-10-01', end: '2026-09-21' });
    expect(defaultMissedAppointmentRange('2026-01-05')).toEqual({ start: '2025-02-01', end: '2026-01-05' });
  });
});
