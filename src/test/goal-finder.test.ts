/**
 * Picking a goal by talking it through — the pure rules behind the finder:
 * what Pathfinder is sent (the latest turns, bounded), what is kept with the
 * goal afterwards (the real exchange, never the static opener), how its
 * candidates are read back (defensively, at most three), and what the form
 * gets when one is picked (the candidate's words, a target date only when it
 * gave a timeframe).
 */
import { describe, expect, it } from 'vitest';
import {
  boundTranscript,
  candidateDueOn,
  candidateToForm,
  exchangeOnly,
  FINDER_OPENER,
  parseCandidates,
  type FinderTurn,
} from '@/lib/goal-finder';

const opener: FinderTurn = { author: 'pathfinder', content: FINDER_OPENER };

describe('what Pathfinder is sent', () => {
  it('keeps the latest turns, trims and caps each, and drops blanks', () => {
    const turns: FinderTurn[] = [
      opener,
      { author: 'member', content: '   ' },
      { author: 'member', content: '  cancellations are killing the hygiene column  ' },
      { author: 'pathfinder', content: 'x'.repeat(2000) },
    ];
    const sent = boundTranscript(turns);
    expect(sent).toHaveLength(3);
    expect(sent[1]).toEqual({ author: 'member', content: 'cancellations are killing the hygiene column' });
    expect(sent[2].content).toHaveLength(1500);
  });

  it('never sends more than the window', () => {
    const many: FinderTurn[] = Array.from({ length: 30 }, (_, i) => ({
      author: i % 2 ? 'pathfinder' : 'member',
      content: `turn ${i}`,
    }));
    const sent = boundTranscript(many, 12);
    expect(sent).toHaveLength(12);
    expect(sent[0].content).toBe('turn 18');
    expect(sent[11].content).toBe('turn 29');
  });

  it('coerces an unknown author to the member', () => {
    const sent = boundTranscript([{ author: 'system' as unknown as 'member', content: 'hi' }]);
    expect(sent[0].author).toBe('member');
  });
});

describe('what is kept with the goal', () => {
  it('drops the static opener and keeps the real exchange', () => {
    const turns: FinderTurn[] = [
      opener,
      { author: 'member', content: 'I keep putting off recall calls' },
      { author: 'pathfinder', content: 'Here are three ways in.' },
    ];
    expect(exchangeOnly(turns)).toEqual(turns.slice(1));
  });

  it('keeps nothing when the member never said anything', () => {
    expect(exchangeOnly([opener])).toEqual([]);
    expect(exchangeOnly([])).toEqual([]);
  });
});

describe('reading candidates back', () => {
  it('takes at most three titled candidates, bounded, with a sane week count', () => {
    const raw = [
      { title: ' Make every recall call the same day ', target: '25 calls', why: 'You named recall.', weeks: 4 },
      { title: '', target: 'ignored', why: '', weeks: 2 },
      { title: 'Confirm every appointment two days ahead', target: '100% confirmed', why: 'Matches the office window.', weeks: '6' },
      { title: 'Too many weeks', target: '1', why: '', weeks: 99 },
      { title: 'Fifth', target: '1', why: '', weeks: 1 },
    ];
    const out = parseCandidates(raw);
    expect(out.map(c => c.title)).toEqual([
      'Make every recall call the same day',
      'Confirm every appointment two days ahead',
      'Too many weeks',
    ]);
    expect(out[0].weeks).toBe(4);
    expect(out[1].weeks).toBe(6);
    expect(out[2].weeks).toBeNull();
  });

  it('reads garbage as no candidates', () => {
    expect(parseCandidates(undefined)).toEqual([]);
    expect(parseCandidates('nope')).toEqual([]);
    expect(parseCandidates([null, 42, 'x'])).toEqual([]);
  });

  it('caps long text so a runaway reply cannot flood the form', () => {
    const [c] = parseCandidates([{ title: 't'.repeat(500), target: 'm'.repeat(500), why: 'w'.repeat(500), weeks: 3 }]);
    expect(c.title).toHaveLength(160);
    expect(c.target).toHaveLength(60);
    expect(c.why).toHaveLength(220);
  });
});

describe('what the form gets', () => {
  it('turns a timeframe into a target date from today, and none into no date', () => {
    expect(candidateDueOn({ weeks: 4 }, '2026-10-10')).toBe('2026-11-07');
    expect(candidateDueOn({ weeks: null }, '2026-10-10')).toBeNull();
    expect(candidateToForm({ title: 'A', target: 'B', why: '', weeks: 2 }, '2026-10-10')).toEqual({ title: 'A', target: 'B', dueOn: '2026-10-24' });
    expect(candidateToForm({ title: 'A', target: 'B', why: '', weeks: null }, '2026-10-10').dueOn).toBe('');
  });
});
