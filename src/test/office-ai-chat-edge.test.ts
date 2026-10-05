// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadEdge } from './helpers/edge-harness';

const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const LOVABLE = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const DOC_HIT = {
  doc_id: 'doc-1', title: 'DD MA Processing Manual', category: 'insurance', chunk_index: 3,
  content: 'Claims must be submitted within 12 months of the date of service.', rank: 0.9,
  section_title: 'Timely Filing', page_number: 12, parse_version: 1,
};

function setup(opts: { openrouterStatus?: number } = {}) {
  const writes = vi.fn();
  const rpc = vi.fn(async () => ({ data: [DOC_HIT], error: null }));
  const from = (table: string) => {
    const result = () => {
      if (table === 'org_members') return { data: { org_id: 'office-a' }, error: null };
      if (table === 'conversations') return { data: { id: 'conv-1', org_id: 'office-a', type: 'ai' }, error: null };
      if (table === 'messages') return { data: [{ sender_kind: 'member', content: 'what is DD MA timely filing?', created_at: '2026-10-05' }], error: null };
      if (table === 'office_docs') return { data: [{ id: 'doc-1', title: 'DD MA Processing Manual', category: 'insurance' }], error: null };
      if (table === 'fee_schedule_items') return { data: [{ code: 'D2740', description: 'Crown', notes: 'Always say delivery.', schedule_id: 's1', fee_schedules: { name: 'Office', kind: 'office' } }], error: null };
      return { data: [], error: null };
    };
    const builder: Record<string, any> = {
      then: (resolve: (v: unknown) => void) => Promise.resolve(result()).then(resolve),
      maybeSingle: async () => result(), single: async () => result(),
    };
    for (const method of ['select', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit']) builder[method] = () => builder;
    for (const method of ['insert', 'update', 'delete']) builder[method] = (value: unknown) => { writes(table, method, value); return builder; };
    return builder;
  };
  let chatRound = 0;
  const gateway = vi.fn().mockImplementation(async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (url === OPENROUTER && opts.openrouterStatus) return new Response('{"error":"no credits"}', { status: opts.openrouterStatus });
    if (Array.isArray(body.plugins)) {
      // The nested web-search call.
      return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'CDT D0140 is a limited oral evaluation (https://example.org/cdt).',
        annotations: [{ type: 'url_citation', url_citation: { url: 'https://example.org/cdt', title: 'CDT code reference' } }] } }] }));
    }
    chatRound += 1;
    const message = chatRound === 1
      ? { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_office_docs', arguments: JSON.stringify({ queries: ['timely filing'] }) } }] }
      : chatRound === 2
        ? { role: 'assistant', content: '', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'search_web', arguments: JSON.stringify({ query: 'CDT D0140 definition' }) } }] }
        : { role: 'assistant', content: 'Per the DD MA manual, claims are due within 12 months.' };
    return new Response(JSON.stringify({ choices: [{ message }] }));
  });
  const client = { from, rpc, auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } }, error: null }) } };
  const edge = loadEdge('supabase/functions/office-ai-chat/index.ts', { 'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client } }, gateway);
  const run = () => edge.handle(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ conversation_id: 'conv-1' }),
  }));
  return { run, gateway, writes, rpc };
}

describe('Office AI chat in Messages', () => {
  it('offers document search and web search, uses both, and stores a cited reply', async () => {
    const test = setup();
    const res = await (await test.run()).json();
    expect(res).toEqual({ replied: true, provider: 'openrouter' });

    const first = JSON.parse(test.gateway.mock.calls[0][1].body);
    expect(test.gateway.mock.calls[0][0]).toBe(OPENROUTER);
    expect(first.tools.map((t: any) => t.function.name)).toEqual(['search_office_docs', 'search_web']);
    // Grounding travels in the system prompt: code notes and the document list.
    expect(first.messages[0].content).toContain('D2740');
    expect(first.messages[0].content).toContain('DD MA Processing Manual');

    expect(test.rpc).toHaveBeenCalledWith('search_office_doc_chunks', expect.objectContaining({ p_query: 'timely filing' }));
    const toolResults = test.gateway.mock.calls.map(c => JSON.parse(c[1].body)).flatMap((b: any) => b.messages.filter((m: any) => m.role === 'tool'));
    expect(toolResults.some((m: any) => m.content.includes('[DD MA Processing Manual — Timely Filing, page 12]'))).toBe(true);
    expect(toolResults.some((m: any) => m.content.includes('https://example.org/cdt'))).toBe(true);

    expect(test.writes).toHaveBeenCalledWith('messages', 'insert', expect.objectContaining({
      sender_kind: 'pathfinder', conversation_id: 'conv-1', org_id: 'office-a',
    }));
    const stored = test.writes.mock.calls.find(c => c[0] === 'messages')![2].content as string;
    expect(stored).toContain('Per the DD MA manual');
    expect(stored).toContain('Sources: DD MA Processing Manual — Timely Filing, p. 12; https://example.org/cdt');
  });

  it('falls back to the Lovable gateway when OpenRouter is out of credits', async () => {
    const test = setup({ openrouterStatus: 402 });
    const res = await (await test.run()).json();
    expect(res).toEqual({ replied: true, provider: 'lovable' });
    const urls = test.gateway.mock.calls.map(c => c[0]);
    expect(urls[0]).toBe(OPENROUTER);
    expect(urls.slice(1).every(u => u === LOVABLE)).toBe(true);
    // The whole turn stays on the fallback once it has switched.
    expect(urls.filter(u => u === OPENROUTER)).toHaveLength(1);
    const lovableBody = JSON.parse(test.gateway.mock.calls[1][1].body);
    expect(lovableBody.model).toBe('synthetic-config');
    expect(test.writes).toHaveBeenCalledWith('messages', 'insert', expect.objectContaining({ sender_kind: 'pathfinder' }));
    const stored = test.writes.mock.calls.find(c => c[0] === 'messages')![2].content as string;
    expect(stored).toContain('Per the DD MA manual');
    // Web search needs OpenRouter, so the fallback turn reports it honestly instead of failing.
    const toolResults = test.gateway.mock.calls.map(c => JSON.parse(c[1].body)).flatMap((b: any) => b.messages.filter((m: any) => m.role === 'tool'));
    expect(toolResults.some((m: any) => m.content.includes('web search is unavailable'))).toBe(true);
  });
});
