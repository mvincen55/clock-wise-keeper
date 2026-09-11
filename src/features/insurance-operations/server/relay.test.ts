// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createInsuranceRelay } from './relay';
import {
  syntheticSettings,
  syntheticTasks,
  demoOrg,
} from '../domain/synthetic';
import { createHmac } from 'node:crypto';
import { RetellAdapter, type RetellSetup } from './retell';
import type { TaskEvent } from '../domain/workflow';
import { parseSubmittedTasks } from './task-input';
import {
  officeBreakdownQuestions,
  settingsSchema,
  genericRuleSchema,
} from '../domain/schema';

const running: ReturnType<typeof createInsuranceRelay>[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((r) => r.close()));
});
async function fixture() {
  const adapter = {
    mode: 'synthetic' as const,
    start: vi.fn(async () => ({
      state: 'created' as const,
      callRef: 'fixture-call',
    })),
    status: vi.fn(async () => 'ended' as const),
    cancel: vi.fn(async () => {}),
    reconcile: vi.fn(async () => ({ state: 'ambiguous' as const })),
  };
  const vendorRequest = vi.fn(() => false);
  const relay = createInsuranceRelay({
    origin: 'https://office.example',
    adapter,
    centsPerMinute: 25,
    vendorRequest,
    readiness: () => ({ ready: true, mode: 'synthetic', requirements: [] }),
    authorize: async (token, org) => {
      if (
        !['fixture-owner', 'fixture-other'].includes(token) ||
        org !== demoOrg
      )
        throw new Error('Denied');
      return {
        userId: token,
        orgId: org,
        settings: syntheticSettings,
        approved: true,
      };
    },
  });
  running.push(relay);
  await new Promise<void>((resolve) =>
    relay.server.listen(0, '127.0.0.1', resolve),
  );
  const address = relay.server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  const post = (
    path: string,
    body: unknown = {},
    extra: Record<string, string> = {},
  ) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://office.example',
        Authorization: 'Bearer fixture-owner',
        'X-Office-Id': demoOrg,
        ...extra,
      },
      body: JSON.stringify(body),
    });
  return { relay, adapter, post, vendorRequest };
}
it('binds sessions to owner and capability, starts once and invalidates clear', async () => {
  const f = await fixture();
  const cap = await (await f.post('/session')).json();
  const headers = { 'X-Session-Id': cap.id, 'X-Session-Secret': cap.secret };
  const task = syntheticTasks(cap.id)[1];
  task.reviewed = true;
  expect(
    (
      await f.post(
        '/start',
        { tasks: [task], settingsVersion: 1 },
        { ...headers, 'X-Session-Secret': 'wrong' },
      )
    ).status,
  ).toBe(410);
  expect(
    (
      await f.post(
        '/start',
        { tasks: [task], settingsVersion: 1 },
        { ...headers, Authorization: 'Bearer fixture-other' },
      )
    ).status,
  ).toBe(410);
  expect(f.adapter.start).not.toHaveBeenCalled();
  expect(
    (await f.post('/start', { tasks: [task], settingsVersion: 1 }, headers))
      .status,
  ).toBe(200);
  expect(
    (await f.post('/start', { tasks: [task], settingsVersion: 1 }, headers))
      .status,
  ).toBe(200);
  expect(f.adapter.start).toHaveBeenCalledTimes(1);
  expect(
    (await f.post('/events', { after: 0 }, headers)).headers.get(
      'cache-control',
    ),
  ).toContain('no-store');
  await f.post('/control', { action: 'clear' }, headers);
  expect((await f.post('/events', { after: 0 }, headers)).status).toBe(410);
  expect(f.adapter.cancel).toHaveBeenCalledWith('fixture-call');
});
it('rejects origin changes, arbitrary routes, extra payloads and unsigned vendor callbacks', async () => {
  const f = await fixture();
  expect(
    (await f.post('/session', {}, { Origin: 'https://evil.example' })).status,
  ).toBe(403);
  expect(
    (await f.post('/session', { patientName: 'synthetic sentinel' })).status,
  ).toBe(410);
  expect((await f.post('/session?member=00001')).status).toBe(404);
  expect((await f.post('/tools/retell', { args: {} })).status).toBe(403);
});
it('strips print snapshots and office policies and rejects unsupported launch data', () => {
  const task = syntheticTasks(crypto.randomUUID())[1];
  task.reviewed = true;
  task.billingPolicy = {
    payerId: task.planIdentity.payerId,
    downgradeFee: 'office_fee',
    maximumFee: 'office_fee',
  };
  expect(parseSubmittedTasks([task])[0]).not.toHaveProperty('billingPolicy');
  expect(() =>
    parseSubmittedTasks([{ ...task, transcript: 'synthetic' }]),
  ).toThrow();
  expect(() =>
    parseSubmittedTasks([{ ...task, attempts: [{ id: 'old' }] }]),
  ).toThrow();
});
it('makes the requested checklist configurable while excluding unusual notes from the catalog', () => {
  const settings = structuredClone(syntheticSettings);
  settings.presets.breakdown.questions = officeBreakdownQuestions;
  expect(settingsSchema.safeParse(settings).success).toBe(true);
  expect(
    officeBreakdownQuestions.filter((q) => q.key === 'frequency'),
  ).toHaveLength(7);
  expect(
    genericRuleSchema.safeParse({
      key: 'unusual_notes',
      scope: 'plan',
      status: 'confirmed',
      value: 'anything',
    }).success,
  ).toBe(false);
});
it('handles signed tool results once, correlates calls and requests cancellation on staff need', async () => {
  const events: TaskEvent[] = [];
  const http = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ call_id: 'fixture-call' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  const setup: RetellSetup = {
    apiKey: 'fixture-key',
    agentId: 'fixture-agent',
    agentVersion: 1,
    fromNumber: '+12025550101',
    payerId: syntheticTasks('s')[1].planIdentity.payerId,
    payerNumber: '+12025550102',
    officeFax: '', // Answers-only requests must not require a fax mapping.
    webhookUrl: 'https://relay.example/webhooks/retell',
    approvedPath: true,
    retentionVerified: true,
    payerWorkflowTested: true,
    practiceName: 'Synthetic office',
    credentials: {},
  };
  const adapter = new RetellAdapter(setup, (e) => events.push(e), http);
  await adapter.start(syntheticTasks('s')[1], 'attempt');
  const body = JSON.stringify({
    name: 'record_benefit_answer',
    call: {
      call_id: 'fixture-call',
      metadata: { attempt_token: 'attempt' },
      transcript: 'ignored synthetic sentinel',
    },
    args: {
      questionId: 'eligible:plan',
      state: 'unknown',
      value: null,
      source: 'representative',
      qualification: 'Unable to verify',
    },
  });
  const sign = (raw: string) => {
    const at = String(Date.now());
    return `v=${at},d=${createHmac('sha256', setup.apiKey)
      .update(raw + at)
      .digest('hex')}`;
  };
  expect(await adapter.tool(body, 'invalid')).toBe(false);
  expect(await adapter.tool(body, sign(body))).toBe(true);
  expect(await adapter.tool(body, sign(body))).toBe(true);
  expect(events).toHaveLength(1);
  expect(JSON.stringify(events)).not.toContain('sentinel');
  const staff = JSON.stringify({
    name: 'report_payer_state',
    call: { call_id: 'fixture-call', metadata: { attempt_token: 'attempt' } },
    args: { action: 'needs_staff', reason: 'staff_authentication' },
  });
  expect(await adapter.tool(staff, sign(staff))).toBe(true);
  expect(http.mock.calls.at(-1)?.[0]).toContain('/v2/stop-call/fixture-call');
});
