// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { loadEdge } from './helpers/edge-harness';

const row = { code: 'D2740', tooth: '3', description: 'Crown', fee: 100, officeFee: 120, entryDate: '', visit: 1 };
function setup(failure: string, endpoint: string) {
  const gateway = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify([row]) } }] })));
  const eq = vi.fn().mockReturnThis();
  const maybeSingle = vi.fn(async () => {
    if (failure === 'membership-throws') throw new Error('lookup failed');
    return { data: ['nonmember','revoked','inactive'].includes(failure) ? null : { org_id: 'office-a' }, error: failure === 'membership-error' ? {} : null };
  });
  const client = {
    auth: { getUser: vi.fn(async () => {
      if (failure === 'token-throws') throw new Error('offline');
      return { data: { user: failure === 'invalid' ? null : { id: 'staff-a', email: 'synthetic@example.test' } }, error: failure === 'invalid' ? {} : null };
    }) },
    rpc: vi.fn(async () => {
      if (failure === 'allowlist-throws') throw new Error('offline');
      return { data: failure !== 'removed', error: failure === 'allowlist-error' ? {} : null };
    }),
    from: vi.fn(() => ({ select: () => ({ eq, limit: () => ({ maybeSingle }) }) })),
  };
  // eq() stays on the membership builder, including its limit method.
  const builder = { select: vi.fn().mockReturnThis(), eq, limit: vi.fn().mockReturnThis(), maybeSingle };
  client.from.mockReturnValue(builder);
  const edge = loadEdge(`supabase/functions/${endpoint}/index.ts`, {
    'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client },
    'npm:@supabase/supabase-js@2/cors': { corsHeaders: {} },
  }, gateway);
  return { ...edge, gateway, client, eq };
}

describe.each(['parse-treatment', 'consent-ai', 'commitment-listen'])('%s paid authorization', endpoint => {
  it.each(['missing','invalid','token-throws','nonmember','revoked','inactive','removed','allowlist-error','allowlist-throws','membership-error','membership-throws'])('rejects %s before calling the gateway', async failure => {
    const { handle, gateway, eq } = setup(failure, endpoint);
    const res = await handle(new Request('https://example.test', { method: 'POST', headers: failure === 'missing' ? {} : { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ image: 'data:image/png;base64,AAAA', action: 'draft', message: 'Synthetic office task' }) }));
    expect(res.status).toBe(401);
    expect(gateway).not.toHaveBeenCalled();
    if (['nonmember','revoked','inactive'].includes(failure)) {
      expect(eq).toHaveBeenCalledWith('user_id', 'staff-a');
      expect(eq).toHaveBeenCalledWith('status', 'active');
    }
  });
});

it('the retired screenshot endpoint never forwards an image, even for an approved member', async () => {
  const { handle, gateway, client } = setup('allowed', 'parse-treatment');
  const res = await handle(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }) }));
  expect(res.status).toBe(410);
  expect((await res.json()).error).toContain('privately in your browser');
  expect(client.rpc).toHaveBeenCalledWith('is_allowed_user');
  expect(gateway).not.toHaveBeenCalled();
});

it.each(['consent-ai', 'commitment-listen'])('an approved active member can reach %s', async endpoint => {
  const { handle, gateway } = setup('allowed', endpoint);
  const body = endpoint === 'consent-ai'
    ? { action: 'assist', mode: 'simplify', text: 'Synthetic template wording.' }
    : { message: 'I will check the office supplies.' };
  const res = await handle(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify(body) }));
  expect(res.status).toBe(200);
  expect(gateway).toHaveBeenCalledTimes(1);
});
