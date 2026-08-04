import { describe, it, expect } from 'vitest';
import {
  buildApptNote,
  buildLedgerChecklist,
  buildPopUp,
  formatDateMDY,
  formatMoney,
  mergeFields,
} from '@/lib/broken-appts/outputs';
import { DEFAULT_BA_SETTINGS, DEFAULT_BA_TEMPLATES, RUNG_BEHAVIOR } from '@/lib/broken-appts/defaults';

// The copy-paste blocks are checked as exact strings — what staff pastes
// into Dentrix must match what the screen renders, dateline included.

const settings = { feeAmount: 75, vipPrepayFloor: 150 };

describe('formatMoney / formatDateMDY', () => {
  it('renders whole dollars without cents', () => {
    expect(formatMoney(75)).toBe('$75');
    expect(formatMoney(75.5)).toBe('$75.50');
  });
  it('renders M/D/YYYY', () => {
    expect(formatDateMDY('2026-08-03')).toBe('8/3/2026');
  });
});

describe('buildPopUp', () => {
  it('Rung 1 has no Pop-Up', () => {
    expect(
      buildPopUp({ rung: 1, todayType: 'LC', settings, todayMDY: '8/3/2026', initials: 'MV' })
    ).toBeNull();
  });

  it('Rung 5 only updates the existing Pop-Up (no fresh block)', () => {
    expect(
      buildPopUp({ rung: 5, todayType: 'NS', settings, todayMDY: '8/3/2026', initials: 'MV' })
    ).toBeNull();
  });

  it('Rung 5 never sends a letter and only offers the holding reply', () => {
    // Management ruling: no letter at Rung 5 ever — not even for a
    // first-ever no-show that happens after 0005 hit the ledger.
    expect(RUNG_BEHAVIOR[5].letterCode).toBeNull();
    expect(RUNG_BEHAVIOR[5].replyCode).toBe('rung5');
  });

  it('Rung 2 block matches the spec exactly, dateline included', () => {
    expect(
      buildPopUp({ rung: 2, todayType: 'NS', settings, todayMDY: '8/3/2026', initials: 'MV' })
    ).toBe(
      '8/3/2026 - "Rung 2 / No-show. $75 posted. DO NOT reschedule until: (1) balance paid in full, (2) card on file. Card will be charged $75 for future broken appointments." - MV'
    );
  });

  it('Rung 4 appends the VIP variant and charges the card', () => {
    const text = buildPopUp({
      rung: 4,
      todayType: 'LC',
      settings,
      todayMDY: '8/3/2026',
      initials: 'MV',
    })!;
    expect(text).toContain('$75 charged to card');
    expect(text).toContain('Patient is VIP ONLY. All future appts canceled.');
    expect(text).toContain('prepay greater of $150 or est. patient portion; forfeited if broken');
  });
});

describe('buildApptNote', () => {
  it('embeds the pasted text in text mode', () => {
    expect(
      buildApptNote({
        todayMDY: '8/3/2026',
        apptDateMDY: '8/10/2026',
        todayType: 'LC',
        onTime: false,
        rung: 3,
        pastedText: "So sorry, can't make Monday!",
        replySent: true,
        initials: 'MV',
      })
    ).toBe(
      '8/3/2026 - "Patient texted to cancel 8/10/2026 appt: \'So sorry, can\'t make Monday!\'. Late — Rung 3. Reply sent." - MV'
    );
  });

  it('omits the pasted-text clause in mode A', () => {
    const note = buildApptNote({
      todayMDY: '8/3/2026',
      apptDateMDY: '8/3/2026',
      todayType: 'NS',
      onTime: false,
      rung: 2,
      replySent: false,
      initials: 'MV',
    });
    expect(note).toBe('8/3/2026 - "Patient no-showed 8/3/2026 appt. Late — Rung 2. Call made." - MV');
    expect(note).not.toContain('texted');
  });

  it('records an on-time verdict without a rung', () => {
    const note = buildApptNote({
      todayMDY: '8/3/2026',
      apptDateMDY: '8/14/2026',
      todayType: 'LC',
      onTime: true,
      rung: 1,
      pastedText: 'Need to move my visit',
      replySent: true,
      initials: 'MV',
    });
    expect(note).toContain('On time');
    expect(note).not.toContain('Rung');
  });
});

describe('buildLedgerChecklist', () => {
  it('Rung 1 posts, credits, and letters', () => {
    expect(buildLedgerChecklist(1, 'LC', settings)).toEqual([
      'Post 9101 + $75 fee',
      'Apply courtesy credit (net $0)',
      'Post 9101A (letter sent)',
    ]);
  });

  it('Rung 3 resolves the event code from what happened today', () => {
    expect(buildLedgerChecklist(3, 'LC', settings)[0]).toBe('Post 9101 + $75 fee');
    expect(buildLedgerChecklist(3, 'NS', settings)[0]).toBe('Post 9100 (auto-fee)');
  });

  it('Rung 4 creates the unscheduled hygiene appointment', () => {
    expect(buildLedgerChecklist(4, 'NS', settings)).toContain(
      'Create unscheduled hygiene appointment'
    );
  });

  it('Rung 5 routes to the Office Manager', () => {
    const steps = buildLedgerChecklist(5, 'NS', settings);
    expect(steps).toContain('Update Pop-Up');
    expect(steps).toContain('Notify Office Manager');
  });
});

describe('mergeFields + reply templates', () => {
  const reply = (code: string) =>
    DEFAULT_BA_TEMPLATES.find(t => t.kind === 'reply' && t.code === code)!.body;

  const fields = {
    first_name: 'Ann',
    office_phone: '(508) 993-0515',
    fee_amount: '$75',
    appt_date: '8/10/2026',
    doctor_name: 'Dr. Harelick',
    personal_line: '',
  };

  it('a blank personal line disappears without doubling spaces', () => {
    const text = mergeFields(reply('rung1'), fields);
    expect(text).toContain('Thanks for letting us know, Ann. Since this was inside');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('  ');
  });

  it('a typed personal line lands where marked', () => {
    const text = mergeFields(reply('rung3'), {
      ...fields,
      personal_line: 'Hope the move went smoothly!',
    });
    expect(text).toContain('know, Ann. Hope the move went smoothly! Because this is inside');
  });

  it('every shipped reply resolves with no leftover merge fields', () => {
    for (const t of DEFAULT_BA_TEMPLATES.filter(t => t.kind === 'reply')) {
      expect(mergeFields(t.body, fields)).not.toContain('{{');
    }
  });
});
