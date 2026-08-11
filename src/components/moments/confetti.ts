import type { ReactionKey } from '@/components/moments/reactions';

/**
 * TEAM MOMENTS — confetti alongside the reveal card.
 *
 * Every approved reaction throws its own kind of confetti, so the celebration
 * matches what was actually sent:
 *
 *   nice_work   quick, snappy toss of small pieces — a burst of applause
 *   celebrate   the full classic toss, most pieces, widest spread
 *   thank_you   soft purple hearts floating gently upward
 *   crushed_it  gold embers shooting up fast and fading
 *   great_save  stars twinkling as they drift down
 *   team_win    two handfuls thrown in from the sides, meeting in the middle
 *
 * Everything here is pure and deterministic: the layout is seeded by the
 * reaction key, so the same reaction always celebrates the same way and tests
 * can pin the behaviour down. Kept modest on purpose — a short, hard-cornered
 * flurry beside the card, never a full-screen shower.
 */

export type ConfettiMotion = 'toss' | 'float' | 'rise' | 'twinkle';
export type ConfettiShape = 'rect' | 'heart' | 'ember' | 'star';
export type ConfettiTone = 'plum' | 'plum-deep' | 'plum-tint' | 'gold';

export type ConfettiPiece = {
  /** Launch point across the card width. */
  xPct: number;
  /** Total horizontal drift over the animation. */
  dxPx: number;
  /** Peak height (negative = up) partway through the animation. */
  midYPx: number;
  /** Resting offset at the end (positive = below the launch point). */
  endYPx: number;
  rotDeg: number;
  delayMs: number;
  durationMs: number;
  widthPx: number;
  heightPx: number;
  shape: ConfettiShape;
  tone: ConfettiTone;
};

export type ConfettiPlan = {
  motion: ConfettiMotion;
  pieces: ConfettiPiece[];
};

/** Bounds tests hold us to: enough to feel fun, never enough to feel loud. */
export const CONFETTI_MIN_PIECES = 8;
export const CONFETTI_MAX_PIECES = 28;
export const CONFETTI_MIN_SIZE = 3;
export const CONFETTI_MAX_SIZE = 10;

type Theme = {
  key: ReactionKey;
  motion: ConfettiMotion;
  shape: ConfettiShape;
  tones: readonly ConfettiTone[];
  count: number;
  /** 'spread' launches across the card; 'sides' from the two edges inward. */
  origin: 'spread' | 'sides';
  durationMs: readonly [number, number];
  maxDelayMs: number;
};

const THEMES: Record<ReactionKey, Theme> = {
  nice_work: {
    key: 'nice_work',
    motion: 'toss',
    shape: 'rect',
    tones: ['plum', 'gold', 'plum-tint'],
    count: 16,
    origin: 'spread',
    durationMs: [850, 1150],
    maxDelayMs: 180,
  },
  celebrate: {
    key: 'celebrate',
    motion: 'toss',
    shape: 'rect',
    tones: ['plum', 'plum-deep', 'plum-tint', 'gold'],
    count: 26,
    origin: 'spread',
    durationMs: [1050, 1500],
    maxDelayMs: 280,
  },
  thank_you: {
    key: 'thank_you',
    motion: 'float',
    shape: 'heart',
    tones: ['plum', 'plum-deep', 'plum-tint'],
    count: 12,
    origin: 'spread',
    durationMs: [1450, 2000],
    maxDelayMs: 380,
  },
  crushed_it: {
    key: 'crushed_it',
    motion: 'rise',
    shape: 'ember',
    tones: ['gold', 'plum-deep', 'plum'],
    count: 16,
    origin: 'spread',
    durationMs: [650, 950],
    maxDelayMs: 240,
  },
  great_save: {
    key: 'great_save',
    motion: 'twinkle',
    shape: 'star',
    tones: ['gold', 'plum-tint', 'plum'],
    count: 12,
    origin: 'spread',
    durationMs: [1300, 1850],
    maxDelayMs: 320,
  },
  team_win: {
    key: 'team_win',
    motion: 'toss',
    shape: 'rect',
    tones: ['plum', 'plum-deep', 'plum-tint', 'gold'],
    count: 24,
    origin: 'sides',
    durationMs: [1000, 1450],
    maxDelayMs: 260,
  },
};

/** FNV-1a hash so a reaction key becomes a stable numeric seed. */
function seedFrom(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG, plenty for scattering confetti. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rnd: () => number, lo: number, hi: number) => lo + rnd() * (hi - lo);

export function confettiPlan(reaction: string): ConfettiPlan {
  const theme = THEMES[reaction as ReactionKey] ?? THEMES.celebrate;
  const rnd = mulberry32(seedFrom(theme.key));

  const pieces: ConfettiPiece[] = Array.from({ length: theme.count }, (_, i) => {
    const size = Math.round(between(rnd, 5, 9));
    const tone = theme.tones[i % theme.tones.length];

    let xPct: number;
    let dxPx: number;
    if (theme.origin === 'sides') {
      // Thrown in from the left and right edges, drifting toward the middle.
      const fromLeft = i % 2 === 0;
      xPct = fromLeft ? between(rnd, 2, 20) : between(rnd, 80, 98);
      dxPx = (fromLeft ? 1 : -1) * between(rnd, 24, 80);
    } else {
      xPct = between(rnd, 4, 96);
      dxPx = between(rnd, -60, 60);
    }

    let midYPx: number;
    let endYPx: number;
    let rotDeg: number;
    switch (theme.motion) {
      case 'toss':
        midYPx = -between(rnd, 55, 130);
        endYPx = between(rnd, 55, 130);
        rotDeg = (rnd() < 0.5 ? -1 : 1) * between(rnd, 140, 520);
        break;
      case 'float':
        midYPx = -between(rnd, 30, 60);
        endYPx = -between(rnd, 65, 115);
        rotDeg = between(rnd, -22, 22);
        break;
      case 'rise':
        midYPx = -between(rnd, 45, 85);
        endYPx = -between(rnd, 85, 150);
        rotDeg = between(rnd, -30, 30);
        break;
      case 'twinkle':
        midYPx = between(rnd, 18, 40);
        endYPx = between(rnd, 45, 95);
        rotDeg = (rnd() < 0.5 ? -1 : 1) * between(rnd, 60, 200);
        break;
    }

    let widthPx = size;
    let heightPx = size;
    if (theme.shape === 'rect') heightPx = Math.max(3, Math.round(size * between(rnd, 0.45, 0.75)));
    if (theme.shape === 'ember') {
      widthPx = 3;
      heightPx = Math.round(size * 1.9);
    }

    return {
      xPct,
      dxPx,
      midYPx,
      endYPx,
      rotDeg,
      delayMs: Math.round(rnd() * theme.maxDelayMs),
      durationMs: Math.round(between(rnd, theme.durationMs[0], theme.durationMs[1])),
      widthPx,
      heightPx,
      shape: theme.shape,
      tone,
    };
  });

  return { motion: theme.motion, pieces };
}

/** When the last piece settles, so the layer can clean itself up. */
export function confettiSettleMs(plan: ConfettiPlan): number {
  return plan.pieces.reduce((mx, p) => Math.max(mx, p.delayMs + p.durationMs), 0);
}
