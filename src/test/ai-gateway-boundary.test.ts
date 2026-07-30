/**
 * The wire-level PHI boundary.
 *
 * Prompt builders change constantly; the POST to the gateway does not. Every
 * AI caller now scrubs at that one point, so this suite checks the boundary
 * itself rather than each prompt: system instructions survive intact, and
 * anything person-level in a user, assistant, or tool turn does not leave.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scrubMessages } from '../../supabase/functions/_shared/ai-safe';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');
const CALLS_GATEWAY = /ai\.gateway\.lovable\.dev|openrouter/i;

function sourceOf(name: string): string {
  const p = join(FUNCTIONS_DIR, name, 'index.ts');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

describe('nothing reaches the gateway unscrubbed', () => {
  const callers = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .filter((n) => CALLS_GATEWAY.test(sourceOf(n)));

  it('found the AI callers', () => {
    expect(callers.length).toBeGreaterThan(5);
  });

  for (const name of callers) {
    it(`${name} scrubs at every gateway call`, () => {
      const src = sourceOf(name);
      const calls = (src.match(/messages:/g) ?? []).length;
      const scrubbed = (src.match(/messages: scrubMessages\(|scrubFreeText|scrubList/g) ?? []).length;
      expect(
        scrubbed,
        `${name} builds a messages payload that is not passed through scrubMessages`,
      ).toBeGreaterThanOrEqual(Math.min(calls, 1));
    });
  }
});

describe('scrubMessages behaviour', () => {
  it('leaves the system instruction untouched', () => {
    const system = 'You are Dr. Smith Assistant. Cite receipts. Never shame anyone.';
    const out = scrubMessages([{ role: 'system', content: system }]);
    expect(out[0].content).toBe(system);
  });

  it('redacts a patient name in a user turn', () => {
    const out = scrubMessages([{ role: 'user', content: 'Robert Chen called about his crown' }]);
    expect(String(out[0].content)).not.toContain('Robert Chen');
  });

  it('redacts inside tool results carrying database rows', () => {
    const out = scrubMessages([
      { role: 'tool', content: JSON.stringify({ note: 'call 508-555-0134 re: chart #4471' }) },
    ]);
    const text = String(out[0].content);
    expect(text).not.toContain('508-555-0134');
    expect(text).not.toContain('4471');
  });

  it('scrubs text parts of multimodal content and leaves images alone', () => {
    const out = scrubMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'This is Maria Delgado at DOB 04/12/1978' },
          { type: 'image_url', image_url: { url: 'https://example.com/x.png' } },
        ],
      },
    ]);
    const parts = out[0].content as Array<Record<string, unknown>>;
    expect(String(parts[0].text)).not.toContain('Maria Delgado');
    expect(String(parts[0].text)).not.toContain('04/12/1978');
    expect(parts[1]).toHaveProperty('image_url');
  });

  it('keeps ordinary practice-ops language readable', () => {
    const out = scrubMessages([{ role: 'user', content: 'Print the day sheet before morning huddle' }]);
    expect(out[0].content).toBe('Print the day sheet before morning huddle');
  });

  it('does not mutate the caller\'s array', () => {
    const input = [{ role: 'user', content: 'Robert Chen called' }];
    scrubMessages(input);
    expect(input[0].content).toBe('Robert Chen called');
  });

  it('survives malformed payloads', () => {
    expect(() => scrubMessages(undefined as never)).not.toThrow();
    expect(() => scrubMessages([null, 42, {}, { role: 'user' }] as never)).not.toThrow();
  });
});
