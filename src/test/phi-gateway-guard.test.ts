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

const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions');

/** Functions that put office free text in a prompt. These must scrub. */
const MUST_SCRUB = [
  'goal-assistant',
  'office-pulse',
  'sprint-verify',
  'commitment-listen',
  'training-roleplay',
  'ask-docs',
  'assistant-auditor',
  'fof-assistant',
  'kimi-agent',
  'reports-analyst',
  'support-agent',
  'training-builder',
  'accountability-engine',
];

/**
 * Functions where the person-level content is the deliberate subject of the
 * request and the user knows they are sending it. Each needs a reason.
 */
const CONSENTED: Record<string, string> = {
  'parse-pdf': 'User uploads a payroll/timesheet PDF and asks for it to be read.',
  'parse-treatment': 'User uploads a treatment plan and asks for it to be parsed.',
  'ingest-doc': 'Owner deliberately uploads office policy documents to the corpus.',
  'name-visits': 'Sees procedure codes and visit structure only — no person fields.',
};

/**
 * Known gaps: these reach the gateway with staff-authored text that is not yet
 * scrubbed. Listed so the exposure is visible and bounded. This list may shrink
 * and must never grow — a new unscrubbed AI caller fails the suite instead of
 * quietly joining the list.
 */
const PENDING_SCRUB: string[] = [];

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

  it('classifies every function that reaches the AI gateway', () => {
    const classified = new Set([...MUST_SCRUB, ...Object.keys(CONSENTED), ...PENDING_SCRUB]);
    const unclassified = callers.filter((n) => !classified.has(n));
    expect(
      unclassified,
      `These functions call the AI gateway but are not classified for PHI. ` +
        `Add scrubbing and list them in MUST_SCRUB, or document why they are exempt: ` +
        unclassified.join(', '),
    ).toEqual([]);
  });

  it('never lets the unscrubbed list grow', () => {
    expect(PENDING_SCRUB.length).toBeLessThanOrEqual(0);
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
