/**
 * Continuous PHI-boundary guard.
 *
 * The AI gateway sits outside this practice's BAA. Anything an edge function
 * puts in a prompt has left the building. Two things are checked here, and both
 * are structural rather than incidental:
 *
 *   1. Every function that talks to the gateway is classified. A new AI caller
 *      that nobody has thought about fails this suite by default.
 *   2. Functions carrying staff free text actually run it through the scrubber,
 *      and the scrubber holds up against realistic dental-office text.
 *
 * The point is that adding an AI call to this codebase should require making a
 * deliberate decision about person-level data, not remembering to.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scrubFreeText, looksPersonLevel } from '../../supabase/functions/_shared/phi-scrub';
import {
  AI_GATEWAY_ALLOWLIST,
  allowlistedSurfaces,
  consentedSurfaces,
  surfacesRequiringScrub,
  assertGatewayAllowed,
} from '../../supabase/functions/_shared/ai-allowlist';

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

const MUST_SCRUB = surfacesRequiringScrub();
const CONSENTED = consentedSurfaces();

function functionDirs(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name);
}

function sourceOf(name: string): string {
  const p = join(FUNCTIONS_DIR, name, 'index.ts');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

const CALLS_GATEWAY = /ai\.gateway\.lovable\.dev|openrouter/i;

describe('every AI caller is a decision someone made', () => {
  const callers = functionDirs().filter((n) => CALLS_GATEWAY.test(sourceOf(n)));

  it('finds the AI callers to check', () => {
    expect(callers.length).toBeGreaterThan(0);
  });

  it('every gateway caller is registered in the allowlist', () => {
    const allowed = new Set(allowlistedSurfaces());
    const unregistered = callers.filter((n) => !allowed.has(n));
    expect(
      unregistered,
      `These functions call the AI gateway but are not registered in ` +
        `supabase/functions/_shared/ai-allowlist.ts. Add an entry with a PHI ` +
        `handler ("scrub" or "consented") and a reason: ${unregistered.join(', ')}`,
    ).toEqual([]);
  });

  it('the allowlist has no stale entries', () => {
    const live = new Set(callers);
    const stale = allowlistedSurfaces().filter((n) => !live.has(n));
    expect(
      stale,
      `Registered but no longer reaching the gateway — remove: ${stale.join(', ')}`,
    ).toEqual([]);
  });

  it('every allowlist entry carries a reason', () => {
    for (const [name, entry] of Object.entries(AI_GATEWAY_ALLOWLIST)) {
      expect(['scrub', 'consented'], `${name} has an unknown handler`).toContain(entry.handler);
      expect(entry.reason.trim().length, `${name} needs a reason`).toBeGreaterThan(10);
    }
  });

  it('refuses an unregistered surface at runtime', () => {
    expect(() => assertGatewayAllowed('brand-new-ai-function')).toThrow(/not registered/i);
    expect(() => assertGatewayAllowed(undefined)).toThrow();
    for (const name of allowlistedSurfaces()) {
      expect(() => assertGatewayAllowed(name)).not.toThrow();
    }
  });

  it('consented exemptions stay rare and deliberate', () => {
    expect(CONSENTED.length).toBeLessThanOrEqual(4);
  });

  for (const name of MUST_SCRUB) {
    it(`${name} scrubs free text before the prompt`, () => {
      const src = sourceOf(name);
      expect(src, `${name}/index.ts is missing`).not.toBe('');
      expect(src).toMatch(/_shared\/(phi-scrub|ai-safe)/);
      expect(src).toMatch(/scrubFreeText|scrubList|scrubMessages/);
    });
  }

  it('goal-assistant sends a checklist count, never checklist titles', () => {
    const src = sourceOf('goal-assistant');
    expect(src).not.toMatch(/checklist_items[\s\S]{0,200}\.select\(["'][^"']*title/);
  });

  it('sprint-verify does not retain the uploaded verification document', () => {
    const src = sourceOf('sprint-verify');
    expect(src).toMatch(/storage[\s\S]{0,120}\.remove\(/);
  });
});

describe('the scrubber holds up against real office text', () => {
  const cases: Array<[string, string]> = [
    ['Patient Robert Chen called about his crown', 'full_name'],
    ['Mrs. Alvarez needs to reschedule', 'titled_name'],
    ['reach her at 508-555-0134', 'phone'],
    ['send to jane.doe@example.com', 'email'],
    ['SSN 123-45-6789 on the form', 'ssn'],
    ['DOB 04/12/1978', 'dob'],
    ['chart #4471', 'chart'],
  ];

  for (const [text, label] of cases) {
    it(`redacts ${label}`, () => {
      const r = scrubFreeText(text);
      expect(r.redacted, `"${text}" passed through untouched`).toBe(true);
      expect(r.text).not.toBe(text);
    });
  }

  it('leaves ordinary practice-ops language intact', () => {
    const safe = [
      'Morning huddle at 8',
      'Get the day sheet printed before open',
      'Confirm tomorrow with the hygiene column',
      'Order more prophy paste',
      'Goal: 92% recall rate by October',
    ];
    for (const phrase of safe) {
      expect(scrubFreeText(phrase).redacted, `over-redacted: "${phrase}"`).toBe(false);
    }
  });

  it('flags person-level text so callers can refuse outright', () => {
    expect(looksPersonLevel('Robert Chen, DOB 01/01/1970')).toBe(true);
    expect(looksPersonLevel('recall count for July')).toBe(false);
  });

  it('never returns text longer than the caller allowed', () => {
    expect(scrubFreeText('Robert Chen '.repeat(400), 200).text.length).toBeLessThanOrEqual(200);
  });

  it('survives hostile input without throwing', () => {
    for (const bad of [undefined, null, 42, {}, [], '\u0000', '😀'.repeat(100)]) {
      expect(() => scrubFreeText(bad)).not.toThrow();
    }
  });
});
