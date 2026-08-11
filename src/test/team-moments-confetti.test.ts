import { describe, expect, it } from 'vitest';
import {
  CONFETTI_MAX_PIECES,
  CONFETTI_MAX_SIZE,
  CONFETTI_MIN_PIECES,
  CONFETTI_MIN_SIZE,
  confettiPlan,
  confettiSettleMs,
} from '@/components/moments/confetti';
import { REACTIONS } from '@/components/moments/reactions';

describe('confetti matches what was sent', () => {
  it('every approved reaction has a confetti plan', () => {
    for (const r of REACTIONS) {
      const plan = confettiPlan(r.key);
      expect(plan.pieces.length).toBeGreaterThan(0);
    }
  });

  it('thank you floats hearts', () => {
    const plan = confettiPlan('thank_you');
    expect(plan.motion).toBe('float');
    expect(plan.pieces.every((p) => p.shape === 'heart')).toBe(true);
    // Hearts drift up, never down.
    expect(plan.pieces.every((p) => p.endYPx < 0)).toBe(true);
  });

  it('celebrate throws the classic toss', () => {
    const plan = confettiPlan('celebrate');
    expect(plan.motion).toBe('toss');
    expect(plan.pieces.every((p) => p.shape === 'rect')).toBe(true);
    // Up first, then back down past the card.
    expect(plan.pieces.every((p) => p.midYPx < 0 && p.endYPx > 0)).toBe(true);
  });

  it('crushed it sends embers rising', () => {
    const plan = confettiPlan('crushed_it');
    expect(plan.motion).toBe('rise');
    expect(plan.pieces.every((p) => p.shape === 'ember' && p.endYPx < 0)).toBe(true);
  });

  it('great save twinkles stars downward', () => {
    const plan = confettiPlan('great_save');
    expect(plan.motion).toBe('twinkle');
    expect(plan.pieces.every((p) => p.shape === 'star' && p.endYPx > 0)).toBe(true);
  });

  it('team win is thrown in from both sides toward the middle', () => {
    const plan = confettiPlan('team_win');
    const left = plan.pieces.filter((p) => p.xPct < 50);
    const right = plan.pieces.filter((p) => p.xPct >= 50);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
    // Everything launches near an edge and drifts inward.
    expect(plan.pieces.every((p) => p.xPct <= 22 || p.xPct >= 78)).toBe(true);
    expect(left.every((p) => p.dxPx > 0)).toBe(true);
    expect(right.every((p) => p.dxPx < 0)).toBe(true);
  });

  it('an unapproved reaction still celebrates (fallback)', () => {
    const plan = confettiPlan('mystery');
    expect(plan.motion).toBe('toss');
    expect(plan.pieces.length).toBeGreaterThan(0);
  });
});

describe('confetti stays clean and professional', () => {
  it('is deterministic: the same reaction always celebrates the same way', () => {
    for (const r of REACTIONS) {
      expect(confettiPlan(r.key)).toEqual(confettiPlan(r.key));
    }
  });

  it('keeps piece counts and sizes modest', () => {
    for (const r of REACTIONS) {
      const plan = confettiPlan(r.key);
      expect(plan.pieces.length).toBeGreaterThanOrEqual(CONFETTI_MIN_PIECES);
      expect(plan.pieces.length).toBeLessThanOrEqual(CONFETTI_MAX_PIECES);
      for (const p of plan.pieces) {
        expect(p.widthPx).toBeGreaterThanOrEqual(CONFETTI_MIN_SIZE);
        expect(p.widthPx).toBeLessThanOrEqual(CONFETTI_MAX_SIZE);
        expect(p.heightPx).toBeGreaterThanOrEqual(CONFETTI_MIN_SIZE);
        expect(p.heightPx).toBeLessThanOrEqual(CONFETTI_MAX_SIZE * 2);
        expect(p.xPct).toBeGreaterThanOrEqual(0);
        expect(p.xPct).toBeLessThanOrEqual(100);
      }
    }
  });

  it('is over in about two seconds, never a lingering shower', () => {
    for (const r of REACTIONS) {
      expect(confettiSettleMs(confettiPlan(r.key))).toBeLessThanOrEqual(2400);
    }
  });
});
