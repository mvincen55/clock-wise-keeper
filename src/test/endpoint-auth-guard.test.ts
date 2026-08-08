/**
 * Continuous auth probe.
 *
 * Every AI and cron endpoint is a public HTTPS URL. The only thing standing
 * between the open internet and this practice's data is the check each function
 * runs in its own code. This suite calls each one the way an outsider would —
 * with nothing but the publishable anon key — and demands a refusal.
 *
 * A function that answers anything other than 401/403 here is reachable by
 * anyone who can read the app bundle.
 */
import { describe, it, expect } from 'vitest';

const BASE = (process.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const LIVE = Boolean(BASE && ANON);

/** Endpoints only the scheduler may run. They require the service-role bearer. */
const CRON_ONLY = [
  { name: 'office-pulse', body: { time: 'probe' } },
  { name: 'integrity-digest', body: {} },
  { name: 'training-reminders', body: {} },
  { name: 'accountability-engine', body: { action: 'sweep' } },
];

/**
 * Endpoints that require a signed-in user (most also require a role).
 * `notDeployedOk` marks a function merged ahead of its first deploy: a 404
 * NOT_FOUND is unreachable-by-definition and acceptable until it ships, at
 * which point the strict 401/403 bar applies. Remove the flag after deploy.
 */
const USER_ONLY: Array<{ name: string; body: unknown; notDeployedOk?: boolean }> = [
  { name: 'commitment-listen', body: { message: 'probe' } },
  { name: 'parse-treatment', body: { image: 'data:image/png;base64,AAAA' } },
  { name: 'sprint-verify', body: { goal_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'sprint-architect', body: { action: 'ideas', scope: 'team' } },
  { name: 'goal-assistant', body: { mode: 'chat', messages: [] } },
  { name: 'reports-analyst', body: { action: 'analyze' } },
  { name: 'training-builder', body: { topic: 'probe' } },
  { name: 'checklist-bypass', body: { action: 'list' } },
  { name: 'export-report', body: {} },
  { name: 'confirm-import', body: { import_id: '00000000-0000-0000-0000-000000000000' } },
  { name: 'ask-docs', body: { question: 'probe' } },
  { name: 'assistant-auditor', body: {} },
  { name: 'training-roleplay', body: { mode: 'start', module_id: '00000000-0000-0000-0000-000000000000' } },
];

/**
 * accept-invite is reachable without a session on purpose — that is the whole
 * point of an invite link. What it must never do is act on a bad token, so the
 * bar here is a refusal, not specifically a 401.
 */
const TOKEN_GATED = [{ name: 'accept-invite', body: { token: 'not-a-real-token' } }];

async function probe(name: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON}`,
      apikey: ANON,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

describe.skipIf(!LIVE)('unauthorized callers are refused', () => {
  for (const { name, body } of CRON_ONLY) {
    it(
      `${name} refuses a caller holding only the anon key`,
      async () => {
        const { status, text } = await probe(name, body);
        expect(
          [401, 403],
          `${name} answered ${status}: ${text.slice(0, 200)}`,
        ).toContain(status);
      },
      30000,
    );
  }

  for (const { name, body, notDeployedOk } of USER_ONLY) {
    it(
      `${name} refuses a caller with no user session`,
      async () => {
        const { status, text } = await probe(name, body);
        if (notDeployedOk && status === 404 && /NOT_FOUND/i.test(text)) return;
        expect(
          [401, 403],
          `${name} answered ${status}: ${text.slice(0, 200)}`,
        ).toContain(status);
      },
      30000,
    );
  }

  for (const { name, body } of TOKEN_GATED) {
    it(
      `${name} refuses an invalid invite token`,
      async () => {
        const { status, text } = await probe(name, body);
        expect(status).toBeGreaterThanOrEqual(400);
        expect(text).not.toMatch(/org_id|user_id|@/i);
      },
      30000,
    );
  }

  it(
    'a spoofed cron header does not get anyone past the door',
    async () => {
      const { status } = await probe(
        'accountability-engine',
        { action: 'sweep' },
        { 'Lovable-Context': 'cron' },
      );
      expect(status).toBe(401);
    },
    30000,
  );

  it(
    'refusals never leak internal detail to the caller',
    async () => {
      const { text } = await probe('office-pulse', { time: 'probe' });
      const leaks = /service_role|postgres|supabase\.co\/rest|at .*index\.ts:\d+|SUPABASE_/i;
      expect(text).not.toMatch(leaks);
    },
    30000,
  );
});
