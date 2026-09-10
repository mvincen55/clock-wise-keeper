// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadEdge } from './helpers/edge-harness';

function setup(role: string, tool = 'save_wording_rule', args = { rule: 'Use delivery instead of seating.' }) {
  const writes = vi.fn();
  const from = (table: string) => {
    const result = () => ({ data: table === 'org_members' ? { org_id: 'office-a', role } : table === 'fof_settings' ? null : [], error: null });
    const builder: Record<string, any> = { then: (resolve: (v: unknown) => void) => Promise.resolve(result()).then(resolve), maybeSingle: async () => result(), single: async () => result() };
    for (const method of ['select', 'eq', 'neq', 'in', 'order', 'limit']) builder[method] = () => builder;
    for (const method of ['insert', 'update', 'delete']) builder[method] = (value: unknown) => { writes(table, method, value); return builder; };
    return builder;
  };
  const gateway = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: gateway.mock.calls.length === 1
    ? { role: 'assistant', tool_calls: [{ id: 'call1', type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] }
    : { role: 'assistant', content: 'General guidance.' } }] })));
  const client = { from, auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } } }) } };
  const edge = loadEdge('supabase/functions/kimi-agent/index.ts', { 'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client } }, gateway);
  const run = (trainingEnabled: unknown, content = 'Use the standard office wording.') => edge.handle(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ mode: 'fof', trainingEnabled,
      context: { treatment: 'PRIVATE_FORM_SENTINEL', visits: [{ procedures: ['PRIVATE_FORM_SENTINEL'] }], patientName: 'PRIVATE_NAME_SENTINEL' },
      messages: [{ role: 'user', content }] }),
  }));
  return { run, gateway, writes };
}

describe('shipped FOF assistant endpoint', () => {
  it.each(['save_memory', 'save_code_note', 'forget_memory', 'save_wording_rule'])('rejects forced %s calls while Training is off', async tool => {
    const test = setup('manager', tool);
    await test.run(false);
    expect(test.gateway).toHaveBeenCalledTimes(2);
    expect(test.writes).not.toHaveBeenCalled();
    const first = JSON.parse(test.gateway.mock.calls[0][1].body);
    expect(first.tools.map((t: any) => t.function.name)).toEqual(['search_office_docs']);
    expect(JSON.stringify(first)).not.toContain('PRIVATE_');
    expect(test.gateway.mock.calls[1][1].body).toContain('Training mode on');
  });
  it('ignores a staff caller requesting Training', async () => {
    const test = setup('staff'); await test.run(true);
    expect(test.writes).not.toHaveBeenCalled();
  });
  it('allows an owner to save general guidance with Training explicitly on', async () => {
    const test = setup('owner'); await test.run(true);
    expect(test.writes).toHaveBeenCalledWith('fof_ai_guidance', 'insert', expect.objectContaining({ org_id: 'office-a', content: 'Use delivery instead of seating.' }));
  });
  it('refuses case-specific training content even when a model requests a save', async () => {
    const test = setup('owner', 'save_wording_rule', { rule: 'This patient owes $600.' }); await test.run(true);
    expect(test.writes).not.toHaveBeenCalled();
  });
  it('rejects personal identifiers before any model request', async () => {
    const test = setup('owner'); await test.run(true, 'Member ID: XYZ12345');
    expect(test.gateway).not.toHaveBeenCalled(); expect(test.writes).not.toHaveBeenCalled();
  });
});
