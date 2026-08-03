import { describe, it, expect } from 'vitest';
import { chunkText, normalizeText } from '../../supabase/functions/_shared/doc-chunking';

describe('normalizeText', () => {
  it('normalizes line endings and collapses whitespace', () => {
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
    expect(normalizeText('a  \t b')).toBe('a b');
    expect(normalizeText('a\n\n\n\nb')).toBe('a\n\nb');
    expect(normalizeText('  padded  ')).toBe('padded');
  });
});

describe('chunkText', () => {
  it('returns empty for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    expect(chunkText('Short policy.')).toEqual(['Short policy.']);
  });

  it('splits long documents into multiple bounded chunks', () => {
    const paragraph = 'Employees accrue PTO at a rate defined by tenure. '.repeat(10);
    const text = Array.from({ length: 20 }, (_, i) => `Section ${i + 1}. ${paragraph}`).join('\n\n');
    const chunks = chunkText(text, { maxChars: 1800, overlapChars: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1800 + 200);
      expect(chunk.trim()).toBe(chunk);
    }
  });

  it('keeps every part of the source text retrievable', () => {
    const sections = Array.from(
      { length: 30 },
      (_, i) => `Policy clause ${i} states that marker-${i} applies to all staff.`
    );
    const chunks = chunkText(sections.join('\n\n'), { maxChars: 300, overlapChars: 50 });
    const joined = chunks.join('\n');
    for (let i = 0; i < 30; i++) {
      expect(joined).toContain(`marker-${i}`);
    }
  });

  it('creates overlap between consecutive chunks', () => {
    const sections = Array.from({ length: 30 }, (_, i) => `Unique sentence number ${i} here.`);
    const chunks = chunkText(sections.join('\n\n'), { maxChars: 300, overlapChars: 60 });
    expect(chunks.length).toBeGreaterThan(2);
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].slice(-30).trim();
      expect(chunks[i]).toContain(prevTail.slice(0, 15));
    }
  });

  it('hard-splits pathological unbroken text without dropping characters', () => {
    const text = 'x'.repeat(10_000);
    const chunks = chunkText(text, { maxChars: 1000, overlapChars: 100 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1100);
    }
    const totalUnique = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(totalUnique).toBeGreaterThanOrEqual(10_000);
  });
});
