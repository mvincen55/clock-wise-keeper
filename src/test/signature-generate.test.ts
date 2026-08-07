import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  generateSignatureOptions,
  seededRandom,
  signatureForms,
} from '@/lib/letters/signature-generate';

/**
 * "Create one for me" — generated staff signatures, drawn as pen strokes
 * (no fonts, deliberately: a name set in a script font does not read as a
 * signature). The generator is pure and seeded, so the option math is
 * fully testable; stroke rendering is exercised by the Chromium check
 * (scripts/signature-generate-check.mjs). Security posture: generation
 * only ever consumes the signed-in employee's OWN display name and saves
 * through the same self-bound pipeline.
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

  it('one set cycles through the distinct signature shapes of the name', () => {
    const options = generateSignatureOptions('Megan Vincent', 11, 5);
    expect(new Set(options.map(o => o.text)).size).toBe(3);
  });

  it('every option is a different hand: size, lean, compression, pressure', () => {
    const options = generateSignatureOptions('Megan Vincent', 3, 6);
    expect(new Set(options.map(o => o.size)).size).toBeGreaterThan(1);
    expect(new Set(options.map(o => o.slant)).size).toBeGreaterThan(1);
    expect(new Set(options.map(o => o.jitterSeed)).size).toBe(6);
    for (const option of options) {
      // A signature scrawl, not typesetting: enlarged capitals, real
      // compression, a leaning baseline, and visible pen character.
      expect(option.capScale).toBeGreaterThan(1.3);
      expect(option.compression).toBeGreaterThan(0);
      expect(option.slant).toBeGreaterThan(0);
      expect(option.wobble).toBeGreaterThan(0);
      expect(option.pen).toBeGreaterThan(1);
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

describe('generation stays self-service and local (static)', () => {
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

  it('the generator draws strokes — no fonts, no AI calls, no network', () => {
    const gen = readFileSync(
      join(process.cwd(), 'src', 'lib', 'letters', 'signature-generate.ts'),
      'utf8',
    );
    expect(gen).not.toMatch(/supabase|functions\.invoke|fetch\(|XMLHttpRequest/);
    expect(gen).not.toMatch(/FontFace|@font-face|fillText|\.woff/i);
  });
});
