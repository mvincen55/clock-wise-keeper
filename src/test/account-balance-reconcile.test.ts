/** Reconciliation invariants: prev + charge + payment = balance, to the penny. */
import { describe, it, expect } from 'vitest';
import {
  findBalanceEpisode,
  findCancellationWaivers,
  findInternalAdjustmentBlocks,
  reconcileLedger,
} from '@/lib/account-balance/reconcile';
import { goldenRows, makeRow } from './account-balance-fixture';

describe('reconcileLedger', () => {
  it('reconciles the golden ledger exactly to $639.00', () => {
    const result = reconcileLedger(goldenRows());
    expect(result.reconciled).toBe(true);
    expect(result.displayedEndingBalanceCents).toBe(63900);
    expect(result.reconstructedEndingBalanceCents).toBe(63900);
    expect(result.differenceCents).toBe(0);
    expect(result.firstMismatchRowId).toBeNull();
    expect(result.openingBalanceCents).toBe(31855);
  });

  it('adds charges and already-negative payments without flipping signs', () => {
    const rows = [
      makeRow({ id: 'a', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation', chargeCents: 39500, balanceCents: 39500 }),
      makeRow({ id: 'b', dateISO: '2026-01-02', rawDescription: 'VISA Payment', paymentCents: -11900, balanceCents: 27600 }),
    ];
    const result = reconcileLedger(rows);
    expect(result.reconciled).toBe(true);
    expect(result.reconstructedEndingBalanceCents).toBe(27600);
  });

  it('identifies the FIRST row where the running balance stops matching', () => {
    const rows = [
      makeRow({ id: 'a', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 6500 }),
      // OCR misread: displayed balance should be 19400.
      makeRow({ id: 'b', dateISO: '2026-01-01', rawDescription: 'Prophylaxis-adult', chargeCents: 12900, balanceCents: 19900 }),
      makeRow({ id: 'c', dateISO: '2026-01-01', rawDescription: 'Bitewing Four Image', chargeCents: 8500, balanceCents: 28400 }),
    ];
    const result = reconcileLedger(rows);
    expect(result.reconciled).toBe(false);
    expect(result.firstMismatchRowId).toBe('b');
  });

  it('requires exact equality by default — no hidden one-cent forgiveness', () => {
    // (The FIRST row seeds the opening balance, so the off-by-one lands on
    // a later row, where every displayed balance must match the math.)
    const rows = [
      makeRow({ id: 'a', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 6500 }),
      makeRow({ id: 'b', dateISO: '2026-01-01', rawDescription: 'Prophylaxis-adult', chargeCents: 100, balanceCents: 6601 }),
    ];
    expect(reconcileLedger(rows).reconciled).toBe(false);
    expect(reconcileLedger(rows).firstMismatchRowId).toBe('b');
    expect(reconcileLedger(rows, 1).reconciled).toBe(true);
  });

  it('handles a balance-forward first row as the opening balance', () => {
    const rows = [
      makeRow({ id: 'bf', dateISO: '2026-01-01', rawDescription: 'Balance Forward', balanceCents: 31855 }),
      makeRow({ id: 'p', dateISO: '2026-01-02', rawDescription: 'VISA Payment', paymentCents: -31855, balanceCents: 0 }),
    ];
    const result = reconcileLedger(rows);
    expect(result.reconciled).toBe(true);
    expect(result.openingBalanceCents).toBe(31855);
  });
});

describe('findBalanceEpisode', () => {
  it('starts the episode at the most recent $0.00 anchor', () => {
    const rows = goldenRows();
    const episode = findBalanceEpisode(rows, reconcileLedger(rows));
    expect(episode.hasZeroAnchor).toBe(true);
    expect(episode.rows[0]?.id).toBe('exam');
    expect(episode.broughtForwardCents).toBe(0);
  });

  it('uses balance-brought-forward when no zero anchor exists', () => {
    const rows = [
      makeRow({ id: 'bf', dateISO: '2026-03-01', rawDescription: 'Balance Forward', balanceCents: 20000 }),
      makeRow({ id: 'c', dateISO: '2026-03-10', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 26500 }),
    ];
    const episode = findBalanceEpisode(rows, reconcileLedger(rows));
    expect(episode.hasZeroAnchor).toBe(false);
    expect(episode.broughtForwardCents).toBe(20000);
    expect(episode.firstImportedDateISO).toBe('2026-03-01');
    expect(episode.rows).toHaveLength(2);
  });
});

describe('findInternalAdjustmentBlocks', () => {
  it('groups the contiguous block and proves it nets to zero', () => {
    const blocks = findInternalAdjustmentBlocks(goldenRows());
    expect(blocks).toHaveLength(1);
    expect(blocks[0].rowIds).toEqual(['adj1', 'adj2', 'adj3']);
    expect(blocks[0].netCents).toBe(0);
    expect(blocks[0].netsToZero).toBe(true);
  });

  it('flags a block that does NOT net to zero', () => {
    const rows = [
      makeRow({ id: 'a1', dateISO: '2026-01-01', rawDescription: 'In-Office Provider Prod Adj', chargeCents: 11900, balanceCents: 11900 }),
      makeRow({ id: 'a2', dateISO: '2026-01-01', rawDescription: 'In-Office Provider Payment Adj', paymentCents: -9770, balanceCents: 2130 }),
    ];
    const blocks = findInternalAdjustmentBlocks(rows);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].netCents).toBe(2130);
    expect(blocks[0].netsToZero).toBe(false);
  });

  it('separates non-contiguous runs into distinct blocks', () => {
    const rows = [
      makeRow({ id: 'a1', dateISO: '2026-01-01', rawDescription: 'In-Office Provider Prod Adj', chargeCents: 100 }),
      makeRow({ id: 'mid', dateISO: '2026-01-02', rawDescription: 'Periodic oral evaluation', chargeCents: 6500 }),
      makeRow({ id: 'a2', dateISO: '2026-01-03', rawDescription: 'In-Office Provider Payment Adj', paymentCents: -100 }),
    ];
    const blocks = findInternalAdjustmentBlocks(rows);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].netsToZero).toBe(false);
    expect(blocks[1].netsToZero).toBe(false);
  });
});

describe('findCancellationWaivers', () => {
  it('links a same-date contiguous exact-offset pair as certain', () => {
    const rows = [
      makeRow({ id: 'fee', dateISO: '2026-06-24', rawDescription: 'CANCELLATION W/OUT NOTICE', chargeCents: 7500, balanceCents: 7500 }),
      makeRow({ id: 'credit', dateISO: '2026-06-24', rawDescription: 'Courtesy Credit', paymentCents: -7500, balanceCents: 0 }),
    ];
    const links = findCancellationWaivers(rows);
    expect(links).toHaveLength(1);
    expect(links[0].certain).toBe(true);
    expect(links[0].amountCents).toBe(7500);
  });

  it('marks a later exact-offset credit as uncertain (staff must confirm)', () => {
    const links = findCancellationWaivers(goldenRows());
    expect(links).toHaveLength(1);
    expect(links[0].feeRowId).toBe('cancel');
    expect(links[0].creditRowId).toBe('courtesy');
    expect(links[0].certain).toBe(false);
  });
});
