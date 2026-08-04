import { describe, it, expect } from 'vitest';
import {
  buildApptNote,
  buildLedgerChecklist,
  buildPopUp,
  buildTransactionLine,
  cardSentenceCode,
  feeClauseShort,
  formatDateMDY,
  formatMoney,
  mergeFields,
  transactionSnippetCode,
} from '@/lib/broken-appts/outputs';
import { DEFAULT_BA_TEMPLATES, RUNG_BEHAVIOR } from '@/lib/broken-appts/defaults';
import type { BaCardState } from '@/lib/broken-appts/types';

// The copy-paste blocks are checked as exact strings — what staff pastes
// into Dentrix must match what the screen renders, dateline included. The
// card-state axis: the card is only ever charged after a prior Pop-Up
// promised it, so "charged" wording may only appear at rungs 3+ on a
// successful charge.

const settings = { feeAmount: 75, vipPrepayFloor: 150 };

const NOT_ASKED: BaCardState = { cardOnFile: null, chargeSucceeded: null };
const NO_CARD: BaCardState = { cardOnFile: false, chargeSucceeded: null };
const CARD_ONLY: BaCardState = { cardOnFile: true, chargeSucceeded: null };
const CHARGED: BaCardState = { cardOnFile: true, chargeSucceeded: true };
const FAILED: BaCardState = { cardOnFile: true, chargeSucceeded: false };

describe('formatMoney / formatDateMDY', () => {
  it('renders whole dollars without cents', () => {
    expect(formatMoney(75)).toBe('$75');
    expect(formatMoney(75.5)).toBe('$75.50');
  });
  it('renders M/D/YYYY', () => {
    expect(formatDateMDY('2026-08-03')).toBe('8/3/2026');
  });
});

describe('card-state selection', () => {
  it('maps the card state to the transaction snippet', () => {
    expect(transactionSnippetCode(CHARGED)).toBe('txn_charged');
    expect(transactionSnippetCode(FAILED)).toBe('txn_posted_card_failed');
    expect(transactionSnippetCode(NO_CARD)).toBe('txn_posted');
    expect(transactionSnippetCode(NOT_ASKED)).toBe('txn_posted');
  });

  it('maps the card state to the card sentence', () => {
    expect(cardSentenceCode(CARD_ONLY)).toBe('card_have');
    expect(cardSentenceCode(NO_CARD)).toBe('card_needed');
  });

  it('builds the short-form fee clause for replies', () => {
    expect(feeClauseShort(CHARGED, true)).toBe('charged to your card on file');
    expect(feeClauseShort(FAILED, true)).toContain("didn't go through");
    expect(feeClauseShort(NO_CARD, true)).toBe(
      "posted to your account, and we'll need a card on file before your next visit"
    );
    expect(feeClauseShort(NO_CARD, false)).toBe('posted to your account');
  });
});

describe('buildTransactionLine', () => {
  it('Rung 2 never says "charged", any card state', () => {
    for (const card of [NOT_ASKED, NO_CARD, CARD_ONLY, CHARGED]) {
      expect(buildTransactionLine(2, 'NS', card, settings)).not.toContain('charged');
      expect(buildTransactionLine(2, 'LC', card, settings)).not.toContain('charged');
    }
    expect(buildTransactionLine(2, 'NS', NO_CARD, settings)).toBe(
      '$75 auto-posted as outstanding balance'
    );
    expect(buildTransactionLine(2, 'LC', NO_CARD, settings)).toBe(
      '$75 posted by staff as outstanding balance'
    );
  });

  it('Rung 3 resolves per the card-state matrix', () => {
    expect(buildTransactionLine(3, 'LC', CHARGED, settings)).toContain(
      'charged to the card on file'
    );
    expect(buildTransactionLine(3, 'LC', FAILED, settings)).toContain('7-business-day');
    expect(buildTransactionLine(3, 'LC', NO_CARD, settings)).toContain('collect a card');
  });

  it('Rung 4 flags the Office Manager on a failed or missing card', () => {
    expect(buildTransactionLine(4, 'NS', FAILED, settings)).toContain('flag Office Manager');
    expect(buildTransactionLine(4, 'NS', NO_CARD, settings)).toContain('flag Office Manager');
    expect(buildTransactionLine(4, 'NS', CHARGED, settings)).not.toContain('flag Office Manager');
  });
});

describe('buildPopUp', () => {
  it('Rung 1 has no Pop-Up', () => {
    expect(
      buildPopUp({
        rung: 1,
        todayType: 'LC',
        card: NOT_ASKED,
        settings,
        todayMDY: '8/3/2026',
        initials: 'MV',
      })
    ).toBeNull();
  });

  it('Rung 2 block matches the spec exactly, dateline included', () => {
    expect(
      buildPopUp({
        rung: 2,
        todayType: 'NS',
        card: CARD_ONLY,
        settings,
        todayMDY: '8/3/2026',
        initials: 'MV',
      })
    ).toBe(
      '8/3/2026 - "Rung 2 / No-show. $75 posted. DO NOT reschedule until: (1) balance paid in full, (2) card on file. Card will be charged $75 for future broken appointments." - MV'
    );
  });

  it('says "charged to card" only on a successful charge', () => {
    const popUp = (rung: 2 | 3 | 4 | 5, card: BaCardState) =>
      buildPopUp({ rung, todayType: 'NS', card, settings, todayMDY: '8/3/2026', initials: 'MV' })!;
    expect(popUp(3, CHARGED)).toContain('$75 charged to card');
    expect(popUp(4, CHARGED)).toContain('$75 charged to card');
    expect(popUp(4, FAILED)).toContain('$75 posted');
    expect(popUp(4, FAILED)).not.toContain('charged to card');
    expect(popUp(4, NO_CARD)).not.toContain('charged to card');
    // Rung 2 is never charged — even a card that could be charged isn't.
    expect(popUp(2, CHARGED)).toContain('$75 posted');
    expect(popUp(2, CHARGED)).not.toContain('charged to card');
  });

  it('Rung 4 appends the VIP variant', () => {
    const text = buildPopUp({
      rung: 4,
      todayType: 'LC',
      card: CHARGED,
      settings,
      todayMDY: '8/3/2026',
      initials: 'MV',
    })!;
    expect(text).toContain('$75 charged to card');
    expect(text).toContain('Patient is VIP ONLY. All future appts canceled.');
    expect(text).toContain('prepay greater of $150 or est. patient portion; forfeited if broken');
  });

  it('Rung 5 renders the update block (card state feeds it)', () => {
    const text = buildPopUp({
      rung: 5,
      todayType: 'NS',
      card: NO_CARD,
      settings,
      todayMDY: '8/3/2026',
      initials: 'MV',
    })!;
    expect(text).toContain('Rung 5 / No-show');
    expect(text).toContain('$75 posted');
    expect(text).toContain('Patient is VIP ONLY');
  });

  it('Rung 5 never sends a letter and only offers the holding reply', () => {
    // Management ruling: no letter at Rung 5 ever — not even for a
    // first-ever no-show that happens after 0005 hit the ledger.
    expect(RUNG_BEHAVIOR[5].popUp).toBe('update');
    expect(RUNG_BEHAVIOR[5].replyCode).toBe('rung5');
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
  it('Rung 1 posts, credits, and letters 0001', () => {
    expect(
      buildLedgerChecklist({ rung: 1, todayType: 'LC', letterCode: '0001', card: NOT_ASKED, settings })
    ).toEqual(['Post 9101 + $75 fee', 'Apply courtesy credit (net $0)', 'Post 0001 (letter sent)']);
  });

  it('Rung 2 collects a card only when none is on file', () => {
    expect(
      buildLedgerChecklist({ rung: 2, todayType: 'NS', letterCode: '0003', card: NO_CARD, settings })
    ).toEqual([
      'Post 9100 (auto-fee)',
      'Collect card on file — required before the next visit',
      'Post 0003 (letter sent)',
    ]);
    expect(
      buildLedgerChecklist({ rung: 2, todayType: 'NS', letterCode: '0003', card: CARD_ONLY, settings })
    ).toEqual(['Post 9100 (auto-fee)', 'Post 0003 (letter sent)']);
  });

  it('Rung 2 via a late cancel posts the 9101 fee and letters 0002', () => {
    expect(
      buildLedgerChecklist({ rung: 2, todayType: 'LC', letterCode: '0002', card: CARD_ONLY, settings })
    ).toEqual(['Post 9101 + $75 fee', 'Post 0002 (letter sent)']);
  });

  it('Rung 3 resolves the event code from what happened today', () => {
    const lc = buildLedgerChecklist({ rung: 3, todayType: 'LC', letterCode: '0004', card: CHARGED, settings });
    const ns = buildLedgerChecklist({ rung: 3, todayType: 'NS', letterCode: '0004', card: CHARGED, settings });
    expect(lc[0]).toBe('Post 9101 + $75 fee');
    expect(ns[0]).toBe('Post 9100 (auto-fee)');
    expect(lc).toContain('Post 0004 (letter sent)');
  });

  it('a failed charge surfaces the 7-business-day card-failure step', () => {
    const steps = buildLedgerChecklist({ rung: 3, todayType: 'LC', letterCode: '0004', card: FAILED, settings });
    expect(steps.join('\n')).toContain('7 business days');
    expect(steps.join('\n')).toContain('failure script');
    const clean = buildLedgerChecklist({ rung: 3, todayType: 'LC', letterCode: '0004', card: CHARGED, settings });
    expect(clean.join('\n')).not.toContain('7 business days');
  });

  it('Rung 4 creates the hygiene appointment and flags the OM on card trouble', () => {
    const charged = buildLedgerChecklist({ rung: 4, todayType: 'NS', letterCode: '0005', card: CHARGED, settings });
    expect(charged).toContain('Create unscheduled hygiene appointment');
    expect(charged.join('\n')).not.toContain('Flag Office Manager');
    const failed = buildLedgerChecklist({ rung: 4, todayType: 'NS', letterCode: '0005', card: FAILED, settings });
    expect(failed.join('\n')).toContain('7 business days');
    expect(failed.join('\n')).toContain('Flag Office Manager');
    const noCard = buildLedgerChecklist({ rung: 4, todayType: 'NS', letterCode: '0005', card: NO_CARD, settings });
    expect(noCard.join('\n')).toContain('Flag Office Manager');
    expect(noCard.join('\n')).not.toContain('7 business days');
  });

  it('Rung 5 routes to the Office Manager', () => {
    const steps = buildLedgerChecklist({ rung: 5, todayType: 'NS', letterCode: null, card: NO_CARD, settings });
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
    fee_clause: feeClauseShort(NO_CARD, true),
    notice_hours: '48',
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

  it('the rung 3 reply fee clause follows the card state', () => {
    expect(mergeFields(reply('rung3'), fields)).toContain(
      "posted to your account, and we'll need a card on file before your next visit"
    );
    expect(
      mergeFields(reply('rung3'), { ...fields, fee_clause: feeClauseShort(CHARGED, true) })
    ).toContain('charged to your card on file');
    expect(
      mergeFields(reply('rung4'), { ...fields, fee_clause: feeClauseShort(FAILED, false) })
    ).toContain("didn't go through");
  });

  it('the rung 2 reply announces the policy update', () => {
    const text = mergeFields(reply('rung2'), fields);
    expect(text).toContain("we've updated our scheduling policy");
    expect(text).toContain('past scheduling difficulty');
  });

  it('every shipped reply resolves with no leftover merge fields', () => {
    for (const t of DEFAULT_BA_TEMPLATES.filter(t => t.kind === 'reply')) {
      expect(mergeFields(t.body, fields)).not.toContain('{{');
    }
  });
});
