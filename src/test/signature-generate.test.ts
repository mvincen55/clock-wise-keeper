import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  generateSignatureOptions,
  seededRandom,
  signatureForms,
  SIGNATURE_FONTS,
} from '@/lib/letters/signature-generate';

/**
 * "Create one for me" — generated staff signatures. The generator is pure
 * and seeded, so the option math is fully testable; canvas rendering is
 * exercised by the Chromium check (scripts/signature-generate-check.mjs).
 * Security posture: generation only ever consumes the signed-in employee's
 * OWN display name and saves through the same self-bound pipeline.
 */

describe('signature name forms', () => {
  it('produces natural signature shapes from a full name', () => {
    expect(signatureForms('Megan Vincent')).toEqual([
      'Megan Vincent',
      'Megan V.',
      'M. Vincent',
    ]);
  });

  it('handles single-word and multi-word names', () => {
    expect(signatureForms('Cher')).toEqual(['Cher']);
    expect(signatureForms('Mary Jo Harelick')).toContain('Mary Harelick');
    expect(signatureForms('Mary Jo Harelick')).toContain('Mary Jo Harelick');
    expect(signatureForms('')).toEqual([]);
  });
});

describe('generated option sets', () => {
  it('is deterministic per (name, seed) — regenerate changes the set', () => {
    const a = generateSignatureOptions('Megan Vincent', 42);
    const b = generateSignatureOptions('Megan Vincent', 42);
    const c = generateSignatureOptions('Megan Vincent', 43);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('every option is a form of the employee’s own name', () => {
    const forms = signatureForms('Megan Vincent');
    for (const option of generateSignatureOptions('Megan Vincent', 7, 6)) {
      expect(forms).toContain(option.text);
    }
  });

  it('one set spans distinct typefaces — never five copies of one script', () => {
    const options = generateSignatureOptions('Megan Vincent', 11, 5);
    const fonts = new Set(options.map(o => o.fontKey));
    expect(fonts.size).toBe(5);
  });

  it('options vary beyond the font: slant, size, wobble, ink', () => {
    const options = generateSignatureOptions('Megan Vincent', 3, 6);
    expect(new Set(options.map(o => o.size)).size).toBeGreaterThan(1);
    expect(new Set(options.map(o => o.slant)).size).toBeGreaterThan(1);
    // Per-character faces get handwriting wobble; connected scripts don't.
    for (const option of options) {
      const font = SIGNATURE_FONTS.find(f => f.key === option.fontKey)!;
      if (font.perChar) expect(option.wobble).toBeGreaterThan(0);
      else expect(option.wobble).toBe(0);
    }
  });

  it('a blank name generates nothing', () => {
    expect(generateSignatureOptions('', 1)).toEqual([]);
  });

  it('the PRNG is stable across runs', () => {
    const r = seededRandom(123);
    const first = [r(), r(), r()];
    const r2 = seededRandom(123);
    expect([r2(), r2(), r2()]).toEqual(first);
  });
});

describe('bundled fonts', () => {
  it('every declared signature font is vendored with its license', () => {
    for (const font of SIGNATURE_FONTS) {
      const file = join(process.cwd(), 'public', font.url);
      expect(existsSync(file), font.url).toBe(true);
    }
    const license = readFileSync(
      join(process.cwd(), 'public', 'fonts', 'signatures', 'LICENSE.md'),
      'utf8',
    );
    expect(license).toContain('SIL Open Font License');
  });
});

describe('generation stays self-service (static)', () => {
  it('the card builds options from the signed-in profile only and saves through the self-bound pipeline', () => {
    const card = readFileSync(
      join(process.cwd(), 'src', 'components', 'letterhead', 'MySignatureCard.tsx'),
      'utf8',
    );
    expect(card).toMatch(/generateSignatureOptions\(myName/);
    expect(card).toMatch(/const myName = myProfile\?\.fullName/);
    // No path exists to feed another user's name or id into generation/save.
    expect(card).not.toMatch(/userId\s*[:=][^=]/);
    expect(card).toContain('useSaveMySignature');
  });

  it('the generator itself is local: no AI calls, no network requests', () => {
    const gen = readFileSync(
      join(process.cwd(), 'src', 'lib', 'letters', 'signature-generate.ts'),
      'utf8',
    );
    expect(gen).not.toMatch(/supabase|functions\.invoke|fetch\(|XMLHttpRequest/);
  });
});
