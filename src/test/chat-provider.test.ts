// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createChatClient, resolveChatProviders, describeProviderFailure, type ChatProvider } from '../../supabase/functions/_shared/chat-provider';

const openrouter: ChatProvider = { name: 'openrouter', url: 'https://openrouter.ai/x', model: 'kimi', apiKey: 'k1', label: 'Kimi (OpenRouter)' };
const lovable: ChatProvider = { name: 'lovable', url: 'https://ai.gateway.lovable.dev/x', model: 'openai/gpt-5.5', apiKey: 'k2', label: 'OpenAI (Lovable gateway)' };
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));

describe('chat provider fallback', () => {
  it('orders OpenRouter before Lovable and skips what is not configured', () => {
    const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
    expect(resolveChatProviders(env({ OPENROUTER_API_KEY: 'a', LOVABLE_API_KEY: 'b' })).map(p => p.name)).toEqual(['openrouter', 'lovable']);
    expect(resolveChatProviders(env({ LOVABLE_API_KEY: 'b', LOVABLE_CHAT_MODEL: 'openai/gpt-5.6-sol' }))[0]).toMatchObject({ name: 'lovable', model: 'openai/gpt-5.6-sol' });
    expect(resolveChatProviders(env({}))).toEqual([]);
  });

  it('uses OpenRouter while it works', async () => {
    const fetchImpl = vi.fn(async () => ok('hi'));
    const client = createChatClient([openrouter, lovable], fetchImpl as unknown as typeof fetch);
    const result = await client.complete({ messages: [] });
    expect(result.ok && result.provider.name).toBe('openrouter');
    expect(client.openrouter).toBe(openrouter);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('falls back on 402 and stays on the fallback for the rest of the turn', async () => {
    const fetchImpl = vi.fn(async (url: string) => url === openrouter.url ? new Response('{}', { status: 402 }) : ok('fallback'));
    const client = createChatClient([openrouter, lovable], fetchImpl as unknown as typeof fetch);
    const first = await client.complete({ messages: [] });
    expect(first.ok && first.provider.name).toBe('lovable');
    expect(client.active?.name).toBe('lovable');
    expect(client.openrouter).toBeNull();
    await client.complete({ messages: [] });
    expect(fetchImpl.mock.calls.map(c => c[0])).toEqual([openrouter.url, lovable.url, lovable.url]);
  });

  it('falls back when OpenRouter does not respond at all', async () => {
    const fetchImpl = vi.fn(async (url: string) => { if (url === openrouter.url) throw new Error('timeout'); return ok('fallback'); });
    const client = createChatClient([openrouter, lovable], fetchImpl as unknown as typeof fetch);
    const result = await client.complete({ messages: [] });
    expect(result.ok && result.provider.name).toBe('lovable');
  });

  it('reports the last failure when every provider fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 402 }));
    const client = createChatClient([openrouter, lovable], fetchImpl as unknown as typeof fetch);
    const result = await client.complete({ messages: [] });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.provider?.name).toBe('lovable');
      expect(describeProviderFailure(result)).toContain('out of credits');
    }
    const none = createChatClient([], fetchImpl as unknown as typeof fetch);
    const empty = await none.complete({ messages: [] });
    expect(empty.ok).toBe(false);
    if (empty.ok === false) expect(describeProviderFailure(empty)).toContain('not configured');
  });
});
