/**
 * The printed payroll record: what leaves the office for payroll must not
 * drift. Renders the sheet with a fixed reference period and snapshots
 * the print DOM, and pins the facts a payroll operator relies on — every
 * clock-in and clock-out with the break between, the adjustment with its
 * reason where it is paid, weekly totals with the over-40 flag, the
 * missing-time call-out, and the signature block.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PayrollPrintSheet, { type PayrollPrintProps } from '@/components/PayrollPrintSheet';

const props: PayrollPrintProps = {
  title: 'Weekly Timesheet',
  periodStart: '2026-09-13',
  periodEnd: '2026-09-19',
  generatedAt: 'Mon, Sep 21, 2026 03:40 PM',
  preparedBy: 'Vincent, Megan · MG07',
  branding: { displayName: 'Northfield Dental Group', legalName: 'Northfield Dental Group, LLC', logoUrl: '/src/assets/practice-logo.png' },
  totals: { payrollMinutes: 2401, recordedMinutes: 2838, adjustmentMinutes: -437, daysWorked: 6, lateDays: 2, editedDays: 1 },
  weeks: [
    { label: 'Doe, Jane · JD01', weekStart: '2026-09-13', workedMinutes: 1845, adjustmentMinutes: -437, totalMinutes: 1408, otMinutes: 0 },
    { label: 'Roe, Rick · RR02', weekStart: '2026-09-13', workedMinutes: 993, adjustmentMinutes: 0, totalMinutes: 993, otMinutes: 0 },
    { label: 'Yu, Sam · SY03', weekStart: '2026-09-13', workedMinutes: 2520, adjustmentMinutes: 0, totalMinutes: 2520, otMinutes: 120 },
  ],
  employees: [
    {
      label: 'Doe, Jane · JD01',
      recordedMinutes: 1845,
      adjustmentMinutes: -437,
      totalMinutes: 1408,
      items: [
        {
          kind: 'day', date: '2026-09-14', totalMinutes: 568, minutesLate: 3, remote: false, edited: false, comment: '', timeStatus: 'OK',
          segments: [
            { inTime: '08:29 AM', outTime: '12:01 PM', inSource: 'Import', outSource: 'Import', breakMinutes: null },
            { inTime: '12:31 PM', outTime: '06:27 PM', inSource: 'Import', outSource: 'Import', breakMinutes: 30 },
          ],
        },
        {
          kind: 'day', date: '2026-09-16', totalMinutes: 721, minutesLate: 0, remote: false, edited: true, comment: 'Covered the late chair', timeStatus: 'OK',
          segments: [{ inTime: '10:05 AM', outTime: '10:06 PM', inSource: 'Manual', outSource: 'Manual', breakMinutes: null }],
        },
        {
          kind: 'day', date: '2026-09-17', totalMinutes: 556, minutesLate: 0, remote: true, edited: false, comment: '', timeStatus: 'MISSING PUNCH',
          segments: [{ inTime: '09:34 AM', outTime: null, inSource: 'GPS', outSource: undefined, breakMinutes: null }],
        },
        { kind: 'adjustment', date: '2026-09-19', hoursDelta: -7.28, reason: 'Scheduled installment 2 of 2: remaining 7.28 hours of the 14.57 excess estimated hours paid for August 30–September 5.' },
      ],
    },
    {
      label: 'Roe, Rick · RR02',
      recordedMinutes: 993,
      adjustmentMinutes: 0,
      totalMinutes: 993,
      items: [
        {
          kind: 'day', date: '2026-09-15', totalMinutes: 600, minutesLate: 0, remote: false, edited: false, comment: '', timeStatus: 'OK',
          segments: [
            { inTime: '09:40 AM', outTime: '02:19 PM', inSource: 'Manual', outSource: 'Manual', breakMinutes: null },
            { inTime: '03:04 PM', outTime: '08:25 PM', inSource: 'Manual', outSource: 'Manual', breakMinutes: 45 },
          ],
        },
        {
          kind: 'day', date: '2026-09-18', totalMinutes: 393, minutesLate: 29, remote: false, edited: false, comment: 'I assumed it was clocking', timeStatus: 'OK',
          segments: [{ inTime: '08:08 AM', outTime: '02:41 PM', inSource: 'Manual', outSource: 'Manual', breakMinutes: null }],
        },
      ],
    },
  ],
  flags: [{ label: 'Yu, Sam · SY03', date: '2026-09-14', kind: 'MISSING DAY' }],
};

describe('payroll print sheet', () => {
  it('prints every punch, break, adjustment, weekly flag, warning, and signature line', () => {
    const html = renderToStaticMarkup(<PayrollPrintSheet {...props} />);
    for (const text of [
      'Northfield Dental Group', 'Payroll records', 'Weekly Timesheet', 'Sun, Sep 13, 2026 – Sat, Sep 19, 2026',
      'Prepared by Vincent, Megan · MG07',
      '40:01', '47:18 recorded −07:17 adjustments',
      'Doe, Jane · JD01', '08:29 AM', '12:01 PM', '12:31 PM', '06:27 PM', '30m break', '45m break',
      'Hours adjustment', 'Scheduled installment 2 of 2', '-7.28h',
      'Yu, Sam · SY03', '2h 0m over', 'MISSING DAY', 'Missing or incomplete time',
      'no clock out', 'MISSING PUNCH · Remote', 'Edited · Covered the late chair', '29m late',
      'Prepared by ______________________________', 'Reviewed by ______________________________',
      'Northfield Dental Group, LLC · Weekly Timesheet',
    ]) {
      expect(html).toContain(text);
    }
    // Import and GPS sources are named; manual ones are not noise.
    expect(html).toContain('(Import)');
    expect(html).toContain('(GPS)');
    expect(html).not.toContain('(Manual)');
    expect(html).toMatchSnapshot();
  });
});
