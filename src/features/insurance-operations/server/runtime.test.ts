// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { TransientRuntime } from './runtime';
import {
  syntheticSettings,
  syntheticTasks,
  demoOrg,
} from '../domain/synthetic';
import type { CallAdapter } from '../adapters/call-contract';
import { verifyRetell, RetellAdapter, type RetellSetup } from './retell';
import { createHmac } from 'node:crypto';
const owner = { userId: 'user', orgId: demoOrg };
function fixture() {
  let enabled = true;
  let now = 10000;
  const adapter: CallAdapter = {
    mode: 'synthetic',
    start: vi.fn(async () => ({ state: 'created' as const, callRef: 'call' })),
    status: vi.fn(async () => 'ended' as const),
    cancel: vi.fn(async () => {}),
    reconcile: vi.fn(async () => ({ state: 'ambiguous' as const })),
  };
  const runtime = new TransientRuntime(
    adapter,
    async (o) => {
      if (o.orgId !== owner.orgId || o.userId !== owner.userId)
        throw new Error('Unauthorized');
      return {
        ...owner,
        settings: { ...syntheticSettings, enabled },
        approved: true,
      };
    },
    () => now,
    60000,
  );
  return {
    runtime,
    adapter,
    disable: () => {
      enabled = false;
    },
    expire: () => {
      now = 70001;
    },
  };
}
describe('transient server runtime', () => {
  it('authorizes every office and session retrieval', async () => {
    const f = fixture();
    const cap = await f.runtime.open(owner);
    await expect(
      f.runtime.read({ ...owner, orgId: 'other' }, cap, 0),
    ).rejects.toThrow();
    await expect(
      f.runtime.read({ ...owner, userId: 'other' }, cap, 0),
    ).rejects.toThrow();
    await expect(
      f.runtime.read(owner, { ...cap, secret: 'wrong' }, 0),
    ).rejects.toThrow();
  });
  it('launches once despite duplicate batch submissions', async () => {
    const f = fixture();
    const cap = await f.runtime.open(owner);
    const t = syntheticTasks(cap.id)[1];
    t.reviewed = true;
    await f.runtime.start(owner, cap, [t], 1);
    await f.runtime.start(owner, cap, [t], 1);
    expect(f.adapter.start).toHaveBeenCalledTimes(1);
  });
  it('server disable rejects starts and expires active calls', async () => {
    const f = fixture();
    const cap = await f.runtime.open(owner);
    const t = syntheticTasks(cap.id)[1];
    t.reviewed = true;
    await f.runtime.start(owner, cap, [t], 1);
    f.disable();
    await expect(f.runtime.start(owner, cap, [t], 1)).rejects.toThrow();
    await f.runtime.pump();
    expect(f.adapter.cancel).toHaveBeenCalledWith('call');
    await expect(f.runtime.read(owner, cap, 0)).rejects.toThrow();
  });
  it('clear and expiry reject late events and cannot reconstruct work', async () => {
    const f = fixture();
    const cap = await f.runtime.open(owner);
    const t = syntheticTasks(cap.id)[1];
    t.reviewed = true;
    await f.runtime.start(owner, cap, [t], 1);
    f.expire();
    await f.runtime.pump();
    await expect(f.runtime.read(owner, cap, 0)).rejects.toThrow();
    expect(f.adapter.cancel).toHaveBeenCalledWith('call');
  });
  it('ambiguous creation holds the concurrency slot instead of launching duplicates', async () => {
    const f = fixture();
    vi.mocked(f.adapter.start).mockResolvedValue({ state: 'ambiguous' });
    const cap = await f.runtime.open(owner);
    const t = syntheticTasks(cap.id)[1];
    t.reviewed = true;
    await f.runtime.start(owner, cap, [t, { ...t, id: 'second' }], 1);
    await f.runtime.pump();
    expect(f.adapter.start).toHaveBeenCalledTimes(1);
    expect((await f.runtime.read(owner, cap, 0))[0].detail).toContain(
      'unknown',
    );
  });
  it('does not accept claims or unreviewed rows', async () => {
    const f = fixture();
    const cap = await f.runtime.open(owner);
    await expect(
      f.runtime.start(owner, cap, syntheticTasks(cap.id), 1),
    ).rejects.toThrow();
    expect(f.adapter.start).not.toHaveBeenCalled();
  });
});
describe('vendor boundary', () => {
  it('validates raw signed body, rejects replay age and altered data', () => {
    const raw = '{"event":"call_ended"}';
    const at = String(Date.now());
    const signature = `v=${at},d=${createHmac('sha256', 'secret')
      .update(raw + at)
      .digest('hex')}`;
    expect(verifyRetell(raw, signature, 'secret')).toBe(true);
    expect(verifyRetell(raw + ' ', signature, 'secret')).toBe(false);
    expect(verifyRetell(raw, signature, 'secret', Number(at) + 300001)).toBe(
      false,
    );
  });
  it('never sends any request without explicit setup readiness', async () => {
    const http = vi.fn();
    const adapter = new RetellAdapter(
      { approvedPath: false } as RetellSetup,
      () => {},
      http,
    );
    expect(await adapter.start(syntheticTasks('s')[0], 'attempt')).toEqual({
      state: 'not_created',
    });
    expect(http).not.toHaveBeenCalled();
  });
});
