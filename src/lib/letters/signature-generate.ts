/**
 * "Create one for me" — handwritten-style signatures generated ENTIRELY in
 * the browser from the signed-in employee's own display name. No AI, no
 * fonts, no network: every option is DRAWN as pen strokes — a procedural
 * cursive stroke alphabet assembled into one continuous polyline per word,
 * smoothed, slanted, compressed, and inked with a downstroke-weighted nib.
 * The chosen result is stored through the exact same secure staff-signature
 * pipeline as Draw and Upload (self-only, org-scoped, private bucket).
 *
 * Reading as a REAL signature comes from the things actual signatures do,
 * all seeded per option:
 *   - one continuous connected stroke per word (pen lifts only for t-bars,
 *     i-dots, and crosses)
 *   - oversized initial capitals, with the rest of the word tucked under
 *   - progressive compression: middle letters shrink, tighten, and at high
 *     compression flatten toward the half-legible scrawl of a practiced
 *     signature
 *   - baseline drift and low-frequency hand tremor (a hand never writes
 *     level), per-point jitter, slant, whole-signature rotation
 *   - ink that thickens on downstrokes and thins on fast rises, plus
 *     tapered flourishes: an underline swash, an exit tail, or none
 *
 * The option list is deterministic per (name, seed) so tests can pin it;
 * "New options" just advances the seed.
 */

/** Deterministic PRNG (mulberry32) so a seed reproduces its option set. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Natural signature forms of a display name. A one-word name signs as
 * itself; multi-word names produce the shapes people actually sign with.
 */
export function signatureForms(displayName: string): string[] {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length === 1) return [words[0]];
  const first = words[0];
  const last = words[words.length - 1];
  const forms = [
    `${first} ${last}`,
    `${first} ${last[0]}.`,
    `${first[0]}. ${last}`,
  ];
  if (words.length > 2) forms.push(words.join(' '));
  return [...new Set(forms)];
}

/** Ink shades a real pen leaves — near-black with subtle blue/violet casts. */
const INK_SHADES = ['#161629', '#1b2440', '#101018', '#241d33'];

export type SignatureFlourish = 'none' | 'underline' | 'tail';

export interface SignatureOption {
  /** The exact text drawn (a form of the employee's own display name). */
  text: string;
  /** x-height of the body letters, canvas px. */
  size: number;
  /** Initial-capital exaggeration, e.g. 1.6 = 60% taller than the body. */
  capScale: number;
  /** How hard the middle letters shrink and squeeze into scrawl (0..1). */
  compression: number;
  /** Whole-signature baseline drift in px over its width (± = fall/rise). */
  drift: number;
  /** Horizontal shear (radians) — cursive lean. */
  slant: number;
  /** Whole-signature rotation, radians. */
  rotation: number;
  /** Per-point jitter amplitude, px. */
  wobble: number;
  /** Hand-tremor wave amplitude, px. */
  tremor: number;
  /** Letter roundness: 1 = as designed, <1 sharpens, >1 loosens curves. */
  looseness: number;
  ink: string;
  flourish: SignatureFlourish;
  /** Base nib width, px. */
  pen: number;
  /** Seed for the per-point jitter inside the renderer. */
  jitterSeed: number;
}

/**
 * The deterministic option set for (name, seed) — every option a different
 * hand: lean, pressure, compression, drift, flourish, and pen all vary.
 */
export function generateSignatureOptions(
  displayName: string,
  seed: number,
  count = 5,
): SignatureOption[] {
  const forms = signatureForms(displayName);
  if (forms.length === 0) return [];
  const rand = seededRandom(seed);
  const flourishes: SignatureFlourish[] = ['none', 'underline', 'tail', 'underline', 'none'];
  const formStart = Math.floor(rand() * forms.length);

  // Cycle name forms so one set always shows different signature shapes.
  return Array.from({ length: count }, (_, i) => ({
    text: forms[(formStart + i) % forms.length],
    size: Math.round(30 + rand() * 12),
    capScale: 1.45 + rand() * 0.6,
    compression: 0.25 + rand() * 0.6,
    drift: (rand() * 2 - 1.15) * 12,
    slant: (4 + rand() * 18) * (Math.PI / 180),
    rotation: (rand() * 6 - 4) * (Math.PI / 180),
    wobble: 0.6 + rand() * 1.4,
    tremor: 0.8 + rand() * 2.2,
    looseness: 0.85 + rand() * 0.35,
    ink: INK_SHADES[Math.floor(rand() * INK_SHADES.length)],
    flourish: flourishes[(i + Math.floor(rand() * 2)) % flourishes.length],
    pen: 1.7 + rand() * 1.4,
    jitterSeed: Math.floor(rand() * 2 ** 31),
  }));
}

// ---------------------------------------------------------------------------
// The gestural alphabet: single-stroke cursive letterforms as control points.
// Units: x-height = 1, baseline y = 0, up is NEGATIVE y. Ascenders ≈ -1.8,
// descenders ≈ +0.8. Each glyph's main stroke enters near the left baseline
// and exits near the right baseline so words chain into one continuous line.
// `extra` strokes are pen lifts (t-bars, dots, crosses) drawn afterwards.
// ---------------------------------------------------------------------------

type Pt = [number, number];
interface Glyph {
  adv: number;
  main: Pt[];
  extra?: Pt[][];
}

const L: Record<string, Glyph> = {
  a: { adv: 0.72, main: [[0, -0.15], [0.28, -0.85], [0.38, -1], [0.12, -0.95], [-0.02, -0.5], [0.1, -0.08], [0.32, -0.12], [0.44, -0.6], [0.47, -1], [0.5, -0.4], [0.62, -0.02], [0.72, 0]] },
  b: { adv: 0.62, main: [[0, -0.1], [0.1, -1.1], [0.16, -1.8], [0.18, -1.2], [0.16, -0.5], [0.22, -0.05], [0.42, -0.25], [0.46, -0.7], [0.32, -0.85], [0.5, -0.2], [0.62, 0]] },
  c: { adv: 0.55, main: [[0.42, -0.8], [0.24, -1], [0.04, -0.75], [-0.02, -0.35], [0.12, -0.02], [0.36, -0.08], [0.55, 0]] },
  d: { adv: 0.72, main: [[0, -0.15], [0.28, -0.85], [0.36, -1], [0.1, -0.92], [-0.02, -0.45], [0.1, -0.05], [0.3, -0.2], [0.42, -1.1], [0.46, -1.75], [0.48, -1], [0.52, -0.35], [0.62, -0.02], [0.72, 0]] },
  e: { adv: 0.55, main: [[0, -0.35], [0.22, -0.5], [0.3, -0.9], [0.14, -1], [0.0, -0.6], [0.04, -0.15], [0.22, 0], [0.42, -0.08], [0.55, 0]] },
  f: { adv: 0.55, main: [[0, -0.1], [0.16, -1.1], [0.3, -1.75], [0.38, -1.55], [0.28, -0.9], [0.2, -0.1], [0.16, 0.5], [0.06, 0.78], [0.02, 0.45], [0.2, 0.02], [0.42, -0.05], [0.55, 0]] },
  g: { adv: 0.7, main: [[0, -0.15], [0.28, -0.9], [0.36, -1], [0.1, -0.92], [-0.02, -0.45], [0.12, -0.05], [0.34, -0.3], [0.42, -0.95], [0.44, -0.3], [0.4, 0.45], [0.26, 0.8], [0.14, 0.55], [0.34, 0.05], [0.58, -0.06], [0.7, 0]] },
  h: { adv: 0.72, main: [[0, -0.1], [0.08, -1.2], [0.14, -1.8], [0.16, -1.1], [0.16, -0.4], [0.26, -0.75], [0.42, -0.95], [0.5, -0.6], [0.54, -0.15], [0.64, -0.02], [0.72, 0]] },
  i: { adv: 0.4, main: [[0, -0.1], [0.14, -0.9], [0.18, -1], [0.2, -0.5], [0.28, -0.05], [0.4, 0]], extra: [[[0.2, -1.4], [0.22, -1.45]]] },
  j: { adv: 0.42, main: [[0, -0.1], [0.16, -0.9], [0.2, -1], [0.22, -0.2], [0.2, 0.45], [0.08, 0.8], [-0.02, 0.5], [0.18, 0.05], [0.32, -0.05], [0.42, 0]], extra: [[[0.22, -1.4], [0.24, -1.45]]] },
  k: { adv: 0.65, main: [[0, -0.1], [0.08, -1.2], [0.12, -1.8], [0.15, -1.0], [0.16, -0.55], [0.38, -0.95], [0.46, -1.0], [0.24, -0.55], [0.44, -0.1], [0.55, -0.02], [0.65, 0]] },
  l: { adv: 0.5, main: [[0, -0.1], [0.14, -1.2], [0.26, -1.8], [0.3, -1.5], [0.2, -0.8], [0.14, -0.15], [0.24, -0.02], [0.38, -0.05], [0.5, 0]] },
  m: { adv: 0.95, main: [[0, -0.1], [0.06, -0.9], [0.1, -1], [0.14, -0.45], [0.2, -0.1], [0.26, -0.75], [0.36, -1], [0.42, -0.5], [0.48, -0.1], [0.56, -0.75], [0.66, -1], [0.72, -0.5], [0.78, -0.08], [0.88, -0.02], [0.95, 0]] },
  n: { adv: 0.7, main: [[0, -0.1], [0.06, -0.9], [0.1, -1], [0.14, -0.45], [0.2, -0.08], [0.28, -0.75], [0.4, -1], [0.48, -0.5], [0.54, -0.1], [0.62, -0.02], [0.7, 0]] },
  o: { adv: 0.58, main: [[0, -0.2], [0.1, -0.85], [0.26, -1], [0.4, -0.75], [0.38, -0.3], [0.2, -0.05], [0.34, -0.2], [0.46, -0.28], [0.58, 0]] },
  p: { adv: 0.62, main: [[0, -0.1], [0.1, -0.9], [0.14, -1], [0.16, 0.1], [0.14, 0.7], [0.1, 0.3], [0.16, -0.5], [0.3, -0.9], [0.44, -0.65], [0.42, -0.2], [0.28, -0.05], [0.5, -0.08], [0.62, 0]] },
  q: { adv: 0.68, main: [[0, -0.15], [0.28, -0.9], [0.36, -1], [0.1, -0.92], [-0.02, -0.45], [0.12, -0.05], [0.34, -0.35], [0.42, -0.95], [0.44, -0.2], [0.46, 0.5], [0.54, 0.78], [0.62, 0.4], [0.58, -0.05], [0.68, 0]] },
  r: { adv: 0.55, main: [[0, -0.1], [0.08, -0.9], [0.12, -1], [0.16, -0.6], [0.26, -0.85], [0.38, -0.95], [0.42, -0.7], [0.44, -0.2], [0.5, -0.02], [0.55, 0]] },
  s: { adv: 0.52, main: [[0, -0.1], [0.2, -0.9], [0.28, -1], [0.08, -0.75], [0.32, -0.4], [0.18, -0.08], [0.06, -0.2], [0.3, -0.05], [0.42, -0.05], [0.52, 0]] },
  t: { adv: 0.5, main: [[0, -0.1], [0.12, -1.0], [0.18, -1.45], [0.2, -0.8], [0.2, -0.15], [0.3, -0.02], [0.42, -0.05], [0.5, 0]], extra: [[[-0.02, -1.0], [0.38, -1.12]]] },
  u: { adv: 0.68, main: [[0, -0.1], [0.04, -0.9], [0.08, -1], [0.1, -0.35], [0.2, -0.02], [0.34, -0.4], [0.4, -1], [0.44, -0.4], [0.54, -0.05], [0.68, 0]] },
  v: { adv: 0.6, main: [[0, -0.1], [0.02, -0.9], [0.06, -1], [0.22, -0.1], [0.3, -0.02], [0.44, -0.65], [0.48, -1], [0.52, -0.6], [0.6, -0.25]] },
  w: { adv: 0.85, main: [[0, -0.1], [0.02, -0.9], [0.06, -1], [0.14, -0.1], [0.22, -0.02], [0.32, -0.7], [0.38, -0.95], [0.46, -0.15], [0.54, -0.02], [0.66, -0.7], [0.7, -1], [0.74, -0.5], [0.85, -0.2]] },
  x: { adv: 0.6, main: [[0, -0.9], [0.14, -1], [0.4, -0.3], [0.55, -0.02], [0.6, 0]], extra: [[[0.48, -1.0], [0.3, -0.55], [0.08, -0.05]]] },
  y: { adv: 0.68, main: [[0, -0.1], [0.04, -0.9], [0.08, -1], [0.12, -0.3], [0.22, -0.05], [0.36, -0.55], [0.42, -1], [0.44, -0.2], [0.4, 0.5], [0.26, 0.82], [0.14, 0.5], [0.36, 0.02], [0.56, -0.08], [0.68, 0]] },
  z: { adv: 0.6, main: [[0, -0.9], [0.16, -1], [0.4, -0.95], [0.1, -0.1], [0.4, -0.12], [0.34, 0.4], [0.2, 0.7], [0.16, 0.35], [0.4, -0.02], [0.52, -0.05], [0.6, 0]] },
};

const U: Record<string, Glyph> = {
  A: { adv: 0.85, main: [[-0.05, 0.02], [0.18, -1.1], [0.34, -1.85], [0.44, -1.2], [0.58, -0.15], [0.52, -0.7], [0.2, -0.65], [0.5, -0.6], [0.68, -0.15], [0.85, 0]] },
  B: { adv: 0.72, main: [[0.14, -1.85], [0.1, -1.0], [0.05, -0.1], [0.12, -1.75], [0.42, -1.8], [0.52, -1.45], [0.3, -1.0], [0.55, -0.75], [0.55, -0.25], [0.28, -0.02], [0.6, -0.08], [0.72, 0]] },
  C: { adv: 0.7, main: [[0.6, -1.55], [0.42, -1.85], [0.16, -1.6], [0.0, -0.95], [0.06, -0.3], [0.3, -0.02], [0.52, -0.18], [0.7, 0]] },
  D: { adv: 0.78, main: [[0.12, -1.85], [0.08, -0.9], [0.04, -0.05], [0.12, -1.75], [0.45, -1.7], [0.62, -1.1], [0.55, -0.4], [0.25, -0.02], [0.62, -0.08], [0.78, 0]] },
  E: { adv: 0.65, main: [[0.55, -1.6], [0.35, -1.85], [0.1, -1.55], [0.22, -1.1], [0.4, -1.0], [0.12, -0.8], [0.0, -0.35], [0.18, -0.02], [0.48, -0.1], [0.65, 0]] },
  F: { adv: 0.7, main: [[0.62, -1.7], [0.4, -1.85], [0.28, -1.2], [0.24, -0.5], [0.28, -0.05], [0.42, -0.02], [0.55, -0.05], [0.7, 0]], extra: [[[0.08, -1.05], [0.5, -1.15]]] },
  G: { adv: 0.75, main: [[0.62, -1.6], [0.42, -1.85], [0.14, -1.55], [0.02, -0.9], [0.1, -0.25], [0.35, -0.02], [0.52, -0.35], [0.55, -0.75], [0.35, -0.7], [0.55, -0.4], [0.62, -0.1], [0.75, 0]] },
  H: { adv: 0.85, main: [[0.06, -1.85], [0.1, -1.0], [0.08, -0.1], [0.1, -1.0], [0.5, -1.1], [0.55, -1.85], [0.58, -0.9], [0.6, -0.15], [0.72, -0.02], [0.85, 0]] },
  I: { adv: 0.5, main: [[0.05, -1.8], [0.3, -1.88], [0.2, -1.85], [0.22, -0.9], [0.22, -0.08], [0.05, -0.02], [0.38, -0.05], [0.5, 0]] },
  J: { adv: 0.6, main: [[0.3, -1.85], [0.52, -1.88], [0.44, -1.85], [0.46, -0.9], [0.42, 0.2], [0.26, 0.6], [0.1, 0.35], [0.3, -0.02], [0.48, -0.08], [0.6, 0]] },
  K: { adv: 0.78, main: [[0.08, -1.85], [0.1, -0.95], [0.08, -0.08], [0.12, -0.85], [0.5, -1.6], [0.58, -1.75], [0.28, -0.9], [0.52, -0.15], [0.65, -0.02], [0.78, 0]] },
  L: { adv: 0.68, main: [[0.3, -1.6], [0.2, -1.85], [0.08, -1.4], [0.06, -0.7], [0.02, -0.08], [0.25, -0.02], [0.5, -0.12], [0.68, 0]] },
  M: { adv: 1.0, main: [[0, 0.02], [0.08, -1.0], [0.14, -1.85], [0.28, -0.9], [0.38, -0.25], [0.48, -1.1], [0.58, -1.85], [0.68, -0.85], [0.75, -0.1], [0.88, -0.02], [1.0, 0]] },
  N: { adv: 0.85, main: [[0, 0.02], [0.06, -1.0], [0.1, -1.85], [0.3, -1.0], [0.5, -0.12], [0.55, -0.95], [0.58, -1.85], [0.62, -1.0], [0.7, -0.3], [0.85, -0.05]] },
  O: { adv: 0.72, main: [[0.36, -1.85], [0.1, -1.5], [0.0, -0.85], [0.1, -0.2], [0.36, -0.02], [0.56, -0.5], [0.56, -1.2], [0.38, -1.8], [0.6, -0.6], [0.62, -0.15], [0.72, 0]] },
  P: { adv: 0.68, main: [[0.14, -1.85], [0.1, -0.95], [0.06, -0.05], [0.12, -1.75], [0.44, -1.8], [0.56, -1.4], [0.44, -0.95], [0.16, -0.85], [0.35, -0.4], [0.52, -0.08], [0.68, 0]] },
  Q: { adv: 0.78, main: [[0.36, -1.85], [0.1, -1.45], [0.02, -0.8], [0.14, -0.15], [0.4, -0.05], [0.56, -0.55], [0.54, -1.25], [0.36, -1.8], [0.42, -0.3], [0.56, 0.12], [0.68, -0.12], [0.78, 0]] },
  R: { adv: 0.75, main: [[0.14, -1.85], [0.1, -0.95], [0.06, -0.05], [0.12, -1.75], [0.44, -1.8], [0.56, -1.4], [0.42, -0.95], [0.18, -0.9], [0.45, -0.5], [0.58, -0.1], [0.68, -0.02], [0.75, 0]] },
  S: { adv: 0.62, main: [[0.55, -1.6], [0.35, -1.85], [0.1, -1.5], [0.3, -1.0], [0.5, -0.6], [0.32, -0.08], [0.08, -0.2], [0.3, -0.02], [0.5, -0.06], [0.62, 0]] },
  T: { adv: 0.7, main: [[0.35, -1.8], [0.38, -0.9], [0.36, -0.1], [0.48, -0.02], [0.58, -0.06], [0.7, 0]], extra: [[[0.05, -1.7], [0.4, -1.85], [0.68, -1.75]]] },
  U: { adv: 0.8, main: [[0.05, -1.85], [0.02, -0.9], [0.08, -0.2], [0.3, -0.02], [0.5, -0.4], [0.55, -1.1], [0.56, -1.85], [0.6, -0.9], [0.65, -0.2], [0.8, -0.02]] },
  V: { adv: 0.78, main: [[0.02, -1.85], [0.18, -0.95], [0.3, -0.08], [0.46, -1.0], [0.56, -1.85], [0.62, -1.0], [0.68, -0.35], [0.78, -0.08]] },
  W: { adv: 1.05, main: [[0.0, -1.85], [0.12, -0.9], [0.2, -0.05], [0.34, -0.9], [0.42, -1.5], [0.52, -0.7], [0.6, -0.05], [0.74, -0.95], [0.84, -1.85], [0.92, -0.9], [0.98, -0.3], [1.05, -0.08]] },
  X: { adv: 0.7, main: [[0.02, -1.8], [0.3, -0.95], [0.55, -0.08], [0.65, -0.02], [0.7, 0]], extra: [[[0.6, -1.85], [0.34, -0.95], [0.05, -0.1]]] },
  Y: { adv: 0.72, main: [[0.02, -1.85], [0.12, -1.0], [0.24, -0.6], [0.42, -1.0], [0.5, -1.85], [0.5, -0.9], [0.44, 0.3], [0.28, 0.75], [0.14, 0.45], [0.38, -0.02], [0.58, -0.1], [0.72, 0]] },
  Z: { adv: 0.7, main: [[0.05, -1.75], [0.32, -1.88], [0.6, -1.8], [0.2, -0.95], [0.02, -0.1], [0.35, -0.15], [0.55, -0.1], [0.7, 0]] },
};

const DOT: Glyph = { adv: 0.3, main: [[0.1, -0.06], [0.14, -0.02], [0.12, -0.08]] };

function glyphFor(ch: string): Glyph | null {
  if (ch === '.') return DOT;
  if (ch >= 'a' && ch <= 'z') return L[ch] ?? null;
  if (ch >= 'A' && ch <= 'Z') return U[ch] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// Stroke assembly + inking
// ---------------------------------------------------------------------------

/** Catmull-Rom through the control points → dense polyline. */
function smooth(points: Pt[], steps = 7): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

/**
 * Ink a smoothed stroke with a pressure model: downstrokes press heavier,
 * fast rising strokes thin out — the calligraphic asymmetry that makes a
 * line read as pen instead of plotter.
 */
function inkStroke(ctx: CanvasRenderingContext2D, dense: Pt[], pen: number): void {
  for (let i = 1; i < dense.length; i++) {
    const [x0, y0] = dense[i - 1];
    const [x1, y1] = dense[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const downness = Math.max(0, dy / len); // 1 = straight down
    const width = pen * (0.55 + 0.65 * downness);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

/** A pen stroke that thins from w0 to w1 along a quadratic curve. */
function taperedCurve(
  ctx: CanvasRenderingContext2D,
  p0: Pt, cp: Pt, p1: Pt,
  w0: number, w1: number,
): void {
  const STEPS = 26;
  let [px, py] = p0;
  for (let s = 1; s <= STEPS; s++) {
    const t = s / STEPS;
    const mt = 1 - t;
    const x = mt * mt * p0[0] + 2 * mt * t * cp[0] + t * t * p1[0];
    const y = mt * mt * p0[1] + 2 * mt * t * cp[1] + t * t * p1[1];
    ctx.lineWidth = w0 + (w1 - w0) * t;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    px = x;
    py = y;
  }
}

/**
 * Render an option to a transparent-background canvas — pure stroke
 * drawing, no fonts. Callers pass the result through
 * normalizeSignatureImage (same as Draw/Upload) so every stored signature
 * shares the same crop/scale treatment. Async for interface stability.
 */
export async function renderSignatureOption(option: SignatureOption): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = option.ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const jitter = seededRandom(option.jitterSeed);
  const u = option.size; // x-height in px
  const words = option.text.split(' ').filter(Boolean);

  // ---- assemble strokes (in signature-local coordinates) ----
  const mainStrokes: Pt[][] = [];
  const liftStrokes: Pt[][] = [];
  let x = 0;
  let letterIndex = 0;
  const totalLetters = option.text.replace(/ /g, '').length || 1;

  for (const word of words) {
    const wordLine: Pt[] = [];
    for (let c = 0; c < word.length; c++) {
      const isCapital = c === 0;
      const glyph = glyphFor(word[c]) ?? glyphFor(word[c].toLowerCase());
      if (!glyph) { letterIndex++; continue; }

      // The scrawl curve: letters after the capital progressively shrink
      // and flatten with compression.
      const progress = totalLetters > 1 ? letterIndex / (totalLetters - 1) : 0;
      const collapse = isCapital ? 0 : Math.min(1, progress * 1.35) * option.compression;
      const scale = (isCapital ? option.capScale : 1) * u * (1 - 0.34 * collapse);
      const flatten = 0.42 * collapse; // y toward baseline = letters melt

      const drift = option.drift * (x / (u * 8));
      const place = ([gx, gy]: Pt): Pt => [
        x + gx * scale + (jitter() - 0.5) * 2 * option.wobble,
        gy * scale * (1 - flatten) * option.looseness
          + drift
          + Math.sin(x / (u * 2.1) + option.jitterSeed % 7) * option.tremor
          + (jitter() - 0.5) * 2 * option.wobble,
      ];

      for (const p of glyph.main) wordLine.push(place(p));
      for (const stroke of glyph.extra ?? []) liftStrokes.push(stroke.map(place));

      x += glyph.adv * scale * (1 - 0.28 * collapse);
      letterIndex++;
    }
    if (wordLine.length > 0) mainStrokes.push(wordLine);
    x += u * 0.35; // signatures close word gaps
  }
  if (mainStrokes.length === 0) return null;

  const width = x;

  // ---- ink it ----
  ctx.save();
  ctx.translate(70, 200);
  ctx.rotate(option.rotation);
  ctx.transform(1, 0, -Math.tan(option.slant) * 0.5, 1, 0, 0);

  for (const stroke of mainStrokes) inkStroke(ctx, smooth(stroke), option.pen);
  for (const stroke of liftStrokes) {
    // Lifted strokes (t-bars, dots, crosses) land lighter and quicker.
    inkStroke(ctx, smooth(stroke, 5), option.pen * 0.8);
  }

  const endY = option.drift;
  if (option.flourish === 'underline') {
    // The pen sweeps back under the whole name and lifts away.
    taperedCurve(
      ctx,
      [width * 1.02, endY - u * 0.1],
      [width * 0.45, endY + u * 0.85],
      [-u * 0.6, endY + u * 0.35],
      option.pen * 1.05,
      option.pen * 0.25,
    );
  } else if (option.flourish === 'tail') {
    // An exit tail: out, dip, and away, thinning as the pen leaves.
    taperedCurve(
      ctx,
      [width * 0.99, endY - u * 0.15],
      [width + u * 1.1, endY + u * 0.45],
      [width + u * 2.1, endY - u * 0.5],
      option.pen * 0.95,
      option.pen * 0.2,
    );
  }
  ctx.restore();

  return canvas;
}
