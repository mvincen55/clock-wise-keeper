/**
 * "Create one for me" — professional handwritten-style signatures generated
 * ENTIRELY in the browser from the signed-in employee's own display name.
 * No AI, no network beyond loading the bundled OFL fonts; the chosen result
 * is stored through the exact same secure staff-signature pipeline as Draw
 * and Upload (self-only, org-scoped, private bucket).
 *
 * Looking like a real signature (not "name in a script font") comes from
 * layered, seeded variation:
 *   - name FORM: full name, first name + last initial, initial + last name…
 *   - six bundled handwriting/script typefaces (public/fonts/signatures/)
 *   - slant, size, weight, squeeze, and per-character baseline wobble and
 *     rotation for the print-style faces (connected scripts keep their
 *     ligatures and get whole-word treatment instead)
 *   - ink shade variation and an optional underline flourish
 *
 * The option list is deterministic per (name, seed) so tests can pin it;
 * "New options" just advances the seed.
 */

export interface SignatureFont {
  key: string;
  family: string;
  /** Path under the app origin (vendored, OFL-licensed). */
  url: string;
  /** Per-character jitter suits print-style faces; connected scripts keep
   *  their ligatures and get whole-word treatment instead. */
  perChar: boolean;
  /** Relative size correction so all faces render at a similar ink height. */
  scale: number;
}

export const SIGNATURE_FONTS: SignatureFont[] = [
  { key: 'caveat', family: 'PE Sig Caveat', url: '/fonts/signatures/caveat.woff2', perChar: true, scale: 1.08 },
  { key: 'greatvibes', family: 'PE Sig Great Vibes', url: '/fonts/signatures/greatvibes.woff2', perChar: false, scale: 1.0 },
  { key: 'sacramento', family: 'PE Sig Sacramento', url: '/fonts/signatures/sacramento.woff2', perChar: false, scale: 1.05 },
  { key: 'homemadeapple', family: 'PE Sig Homemade Apple', url: '/fonts/signatures/homemadeapple.woff2', perChar: true, scale: 0.85 },
  { key: 'mrssaintdelafield', family: 'PE Sig Mrs Saint Delafield', url: '/fonts/signatures/mrssaintdelafield.woff2', perChar: false, scale: 1.12 },
  { key: 'alexbrush', family: 'PE Sig Alex Brush', url: '/fonts/signatures/alexbrush.woff2', perChar: false, scale: 1.05 },
];

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

export interface SignatureOption {
  /** The exact text drawn (a form of the employee's own display name). */
  text: string;
  fontKey: string;
  /** Font size in canvas px. */
  size: number;
  /** Horizontal shear, radians. */
  slant: number;
  /** Whole-signature rotation, radians. */
  rotation: number;
  /** Extra letter squeeze (negative px) for a connected look. */
  squeeze: number;
  /** Per-character wobble amplitude (px); 0 for connected scripts. */
  wobble: number;
  ink: string;
  underline: boolean;
  /** Stroke-thickening passes to vary apparent pen weight. */
  weight: 1 | 2;
}

/**
 * The deterministic option set for (name, seed). Cycles fonts so one set
 * always shows distinct typefaces, then varies everything else per option.
 */
export function generateSignatureOptions(
  displayName: string,
  seed: number,
  count = 5,
): SignatureOption[] {
  const forms = signatureForms(displayName);
  if (forms.length === 0) return [];
  const rand = seededRandom(seed);
  const fontStart = Math.floor(rand() * SIGNATURE_FONTS.length);

  return Array.from({ length: count }, (_, i) => {
    const font = SIGNATURE_FONTS[(fontStart + i) % SIGNATURE_FONTS.length];
    const text = forms[Math.floor(rand() * forms.length)];
    return {
      text,
      fontKey: font.key,
      size: Math.round((44 + rand() * 16) * font.scale),
      slant: (rand() * 14 - 2) * (Math.PI / 180),
      rotation: (rand() * 5 - 3) * (Math.PI / 180),
      squeeze: font.perChar ? -(0.5 + rand() * 1.5) : 0,
      wobble: font.perChar ? 1 + rand() * 2 : 0,
      ink: INK_SHADES[Math.floor(rand() * INK_SHADES.length)],
      underline: rand() < 0.35,
      weight: rand() < 0.4 ? 2 : 1,
    };
  });
}

const loadedFonts = new Map<string, Promise<void>>();

/** Load a bundled signature font once via the FontFace API. */
function ensureFont(font: SignatureFont): Promise<void> {
  let pending = loadedFonts.get(font.key);
  if (!pending) {
    const face = new FontFace(font.family, `url(${font.url}) format('woff2')`);
    pending = face.load().then(loaded => {
      document.fonts.add(loaded);
    });
    loadedFonts.set(font.key, pending);
  }
  return pending;
}

/**
 * Render an option to a transparent-background canvas. Callers pass the
 * result through normalizeSignatureImage (same as Draw/Upload) so every
 * stored signature shares the same crop/scale treatment.
 */
export async function renderSignatureOption(option: SignatureOption): Promise<HTMLCanvasElement | null> {
  const font = SIGNATURE_FONTS.find(f => f.key === option.fontKey);
  if (!font) return null;
  try {
    await ensureFont(font);
  } catch {
    return null; // font asset unavailable — the caller drops this option
  }

  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = option.ink;
  ctx.strokeStyle = option.ink;
  ctx.font = `${option.size}px "${font.family}"`;
  ctx.textBaseline = 'alphabetic';

  const baseline = 170;
  const startX = 40;

  ctx.save();
  // Whole-signature character: rotation around the start of the ink, then
  // a horizontal shear for slant.
  ctx.translate(startX, baseline);
  ctx.rotate(option.rotation);
  ctx.transform(1, 0, -Math.tan(option.slant) * 0.35, 1, 0, 0);

  const drawText = (dx: number, dy: number) => {
    if (option.wobble > 0) {
      // Print-style faces: each character drifts and tilts a little, the
      // way an actual hand does.
      const jitter = seededRandom(
        Math.abs(Math.round(option.size * 97 + option.slant * 1000 + option.text.length)),
      );
      let x = dx;
      for (const ch of option.text) {
        const rise = (jitter() - 0.5) * 2 * option.wobble;
        const tilt = (jitter() - 0.5) * 0.06;
        ctx.save();
        ctx.translate(x, dy + rise);
        ctx.rotate(tilt);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        x += ctx.measureText(ch).width + option.squeeze;
      }
      return x;
    }
    ctx.fillText(option.text, dx, dy);
    return dx + ctx.measureText(option.text).width;
  };

  const endX = drawText(0, 0);
  // A second, hairline-offset pass reads as a slightly heavier pen.
  if (option.weight === 2) drawText(0.6, 0.25);

  if (option.underline) {
    // A quick swash under the name, rising past its end — pen-lift style.
    const width = Math.max(endX, 60);
    ctx.lineWidth = Math.max(1.4, option.size / 26);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-6, 22);
    ctx.quadraticCurveTo(width * 0.45, 34, width * 1.04, 12);
    ctx.stroke();
  }
  ctx.restore();

  return canvas;
}
