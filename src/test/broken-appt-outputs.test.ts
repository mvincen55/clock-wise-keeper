import { describe, it, expect } from 'vitest';
import {
  buildApptNote,
  buildLedgerChecklist,
  buildPopUp,
  deriveInitials,
  formatDateMDY,
  formatLedgerChecklist,
  formatMoney,
  mergeFields,
} from '@/lib/broken-appts/outputs';
import {
  canonicalLetterCode,
  DEFAULT_BA_SETTINGS,
  DEFAULT_BA_TEMPLATES,
  findLetterTemplate,
  missingTemplateSeeds,
  RUNG_BEHAVIOR,
} from '@/lib/broken-appts/defaults';

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

  it('Rung 3 posts by default and charges only when a card is on file', () => {
    expect(
      buildPopUp({ rung: 3, todayType: 'LC', settings, todayMDY: '8/3/2026', initials: 'MV' })
    ).toContain('$75 posted');
    expect(
      buildPopUp({ rung: 3, todayType: 'LC', settings, todayMDY: '8/3/2026', initials: 'MV', cardOnFile: true })
    ).toContain('$75 charged to card');
    expect(
      buildPopUp({ rung: 4, todayType: 'NS', settings, todayMDY: '8/3/2026', initials: 'MV', cardOnFile: false })
    ).toContain('$75 posted');
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

describe('deriveInitials', () => {
  it('derives from a two-word name', () => {
    expect(deriveInitials('Ann Smith')).toBe('AS');
  });
  it('uses the first and LAST word, skipping middle names', () => {
    expect(deriveInitials('Mary Jo Parker')).toBe('MP');
  });
  it('a single word yields its first letter, uppercased', () => {
    expect(deriveInitials('cher')).toBe('C');
  });
  it('a missing name yields empty — callers prompt instead of stamping blanks', () => {
    expect(deriveInitials('')).toBe('');
    expect(deriveInitials('   ')).toBe('');
  });
});

describe('buildLedgerChecklist', () => {
  it('Rung 1 posts, credits, and letters', () => {
    expect(buildLedgerChecklist(1, 'LC', settings)).toEqual([
      'Post 9101 + $75 fee',
      'Apply courtesy credit (net $0)',
      'Post 0001 (letter sent)',
    ]);
  });

  it('Rung 3 resolves the event code from what happened today', () => {
    expect(buildLedgerChecklist(3, 'LC', settings)[0]).toBe('Post 9101 + $75 fee');
    expect(buildLedgerChecklist(3, 'NS', settings)[0]).toBe('Post 9100 (auto-fee)');
  });

  it('Rung 2 letters the code actually printed (0002 for a transition late cancel)', () => {
    expect(buildLedgerChecklist(2, 'LC', settings, '0002')).toEqual([
      'Post 9101 + $75 fee',
      'Post 0002 (letter sent)',
    ]);
    expect(buildLedgerChecklist(2, 'NS', settings)).toEqual([
      'Post 9100 (auto-fee)',
      'Post 0003 (letter sent)',
    ]);
  });

  it('Rung 3 charges the card when one is on file, otherwise collects it', () => {
    expect(buildLedgerChecklist(3, 'NS', settings, undefined, true)).toEqual([
      'Post 9100 (auto-fee)',
      'Charge $75 to the card on file',
      'Post 0004 (letter sent)',
    ]);
    expect(buildLedgerChecklist(3, 'LC', settings, undefined, false)[1]).toBe(
      'Collect a card on file now (fee stays an outstanding balance)'
    );
    expect(buildLedgerChecklist(3, 'NS', settings)[2]).toBe('Post 0004 (letter sent)');
  });

  it('the copy-paste checklist is stamped with the staff initials', () => {
    const text = formatLedgerChecklist(['Post 9100 (auto-fee)', 'Post 0003 (letter sent)'], 'MV');
    expect(text).toBe('☐ Post 9100 (auto-fee)\n☐ Post 0003 (letter sent)\n— MV');
  });

  it('Rung 4 charges the card, cancels future appointments, and creates the hygiene hold', () => {
    const steps = buildLedgerChecklist(4, 'NS', settings);
    expect(steps).toEqual([
      'Post 9100 (auto-fee)',
      'Charge $75 to the card on file',
      'Post 0005 (letter sent)',
      'Cancel all future appointments',
      'Create unscheduled hygiene appointment',
    ]);
    expect(buildLedgerChecklist(4, 'LC', settings, undefined, false)[1]).toBe(
      'No card: fee stays an outstanding balance — flag the Office Manager'
    );
  });

  it('Rung 5 routes to the Office Manager', () => {
    const steps = buildLedgerChecklist(5, 'NS', settings);
    expect(steps).toContain('Update Pop-Up');
    expect(steps).toContain('Notify Office Manager');
  });
});

describe('template seed — the five letters', () => {
  const letters = DEFAULT_BA_TEMPLATES.filter(t => t.kind === 'letter');

  it('seeds all five letters under the policy numbering', () => {
    // 0001 First Late Cancellation, 0002 Late Cancellation with Prior
    // History, 0003 First No-Show, 0004 Additional Broken Appointment,
    // 0005 VIP Scheduling — a higher number is further up the ladder.
    expect(letters.map(l => l.code).sort()).toEqual(['0001', '0002', '0003', '0004', '0005']);
    expect(letters.find(l => l.code === '0002')!.title).toBe(
      'Rung 2 — late cancellation with prior history'
    );
    expect(letters.map(l => l.sortOrder)).toEqual([0, 2, 1, 3, 4]);
  });

  it('draft-coded rows count as their policy letters (no duplicate top-up)', () => {
    const draftOrg = DEFAULT_BA_TEMPLATES.map(t =>
      t.kind === 'letter'
        ? { ...t, code: { '0001': '9101A', '0003': '9100A', '0004': '9106', '0005': '9107' }[t.code] ?? t.code }
        : t
    );
    expect(missingTemplateSeeds(draftOrg)).toEqual([]);
    expect(canonicalLetterCode('9107')).toBe('0005');
    expect(canonicalLetterCode('0002')).toBe('0002');
    expect(findLetterTemplate(draftOrg, '0003')?.code).toBe('9100A');
  });

  it('the top-up inserts only what an org is missing — never touching existing rows', () => {
    // An org seeded before 0002 shipped: four letters + all replies.
    const preExisting = DEFAULT_BA_TEMPLATES.filter(
      t => !(t.kind === 'letter' && t.code === '0002')
    );
    const missing = missingTemplateSeeds(preExisting);
    expect(missing.map(t => `${t.kind}:${t.code}`)).toEqual(['letter:0002']);
    // Fully seeded org: nothing to add.
    expect(missingTemplateSeeds(DEFAULT_BA_TEMPLATES)).toEqual([]);
  });

  it('Rung 2 routes a transition late cancel to 0002; Rung 3 is always 0004', () => {
    expect(RUNG_BEHAVIOR[2].letterCode).toBe('0003');
    expect(RUNG_BEHAVIOR[2].letterCodeLC).toBe('0002');
    expect(RUNG_BEHAVIOR[3].letterCode).toBe('0004');
    expect(RUNG_BEHAVIOR[3].letterCodeLC).toBeUndefined();
    expect(RUNG_BEHAVIOR[1].letterCode).toBe('0001');
    expect(RUNG_BEHAVIOR[4].letterCode).toBe('0005');
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
