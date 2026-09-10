// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { loadEdge } from './helpers/edge-harness';

type Report = { isError?: boolean; structuredContent: { count: number; total_hours?: number; total_minutes?: number; requests?: Array<{ id: string; hours_requested: number; note: string }> } };
type Caller = { isAuthenticated: () => boolean; getUserId: () => string; getToken: () => string };
type Tool = { name: string; handler: (input: Record<string, unknown>, ctx: Caller) => Promise<Report> };

function setup(role: string, denied = '') {
  const tables: Record<string, Record<string, unknown>[]> = {
    org_members: [{ user_id: 'a', org_id: 'office-a', status: 'active', role }, { user_id: 'b', org_id: 'office-b', status: 'active', role }],
    employees: [{ id: 'ea', user_id: 'a', org_id: 'office-a' }, { id: 'eb', user_id: 'b', org_id: 'office-a' }, { id: 'ec', user_id: 'a', org_id: 'office-b' }],
    // Imported rows carry the uploader's user_id, not the employee's auth ID.
    time_entries: [{ employee_id: 'ea', user_id: 'importer-b', org_id: 'office-a', entry_date: '2026-09-01', total_minutes: 480 }, { employee_id: 'eb', user_id: 'a', org_id: 'office-a', entry_date: '2026-09-01', total_minutes: 480 }, { employee_id: 'ec', user_id: 'a', org_id: 'office-b', entry_date: '2026-09-01', total_minutes: 60 }],
    // A manager can create someone else's request; created_by is NOT ownership.
    pto_requests: [{ id: 'own', employee_id: 'ea', org_id: 'office-a', created_by: 'b', hours_requested: 8, note: 'Synthetic', status: 'pending' }, { id: 'other', employee_id: 'eb', org_id: 'office-a', created_by: 'a', hours_requested: 16, note: 'Synthetic', status: 'pending' }, { id: 'cross-office', employee_id: 'ec', org_id: 'office-b', created_by: 'a', hours_requested: 8, note: 'Synthetic', status: 'pending' }],
  };
  const client = { from: (table: string) => {
    let rows = [...tables[table]]; let fields: string[] = [];
    const result = () => ({ data: denied === table ? null : rows.map(r => Object.fromEntries(fields.map(k => [k, r[k]]))), error: denied === table ? { message: 'lookup failed' } : null });
    const q = {
      select: (s: string) => { fields = s.split(',').map(x => x.trim()); if (table === 'pto_requests') expect(fields).toEqual(['id','start_date','end_date','hours_requested','status','note','created_at']); return q; },
      eq: (k: string, v: unknown) => { rows = rows.filter(r => r[k] === v); return q; },
      gte: () => q, lte: () => q, order: () => q, limit: (n: number) => { rows = rows.slice(0, n); return q; },
      maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return q;
  } };
  let bundle: { tools: Tool[] };
  const module = { defineTool: (t: unknown) => t, defineMcp: (m: { tools: Tool[] }) => { bundle = m; return m; }, auth: { oauth: { issuer: () => ({}) } } };
  loadEdge('supabase/functions/mcp/index.ts', {
    'npm:@lovable.dev/mcp-js@0.24.0': module,
    'npm:@lovable.dev/mcp-js@0.24.0/stacks/supabase': { createSupabaseHandler: () => () => new Response() },
    'npm:@supabase/supabase-js@^2.96.0': { createClient: () => client },
    'npm:zod@^3.25.76': { z },
  }, vi.fn());
  const ctx = { isAuthenticated: () => true, getUserId: () => 'a', getToken: () => 'synthetic' };
  return { call: (name: string, input = {}) => bundle.tools.find(t => t.name === name)!.handler(input, ctx), ctx };
}

describe.each(['employee','manager','owner'])('%s personal reports', role => {
  it('includes imported personal hours, never the other employee’s uploaded hours', async () => {
    const { call } = setup(role);
    const result = await call('list_time_entries', { start_date: '2026-09-01', end_date: '2026-09-02' });
    expect(result.structuredContent).toMatchObject({ count: 1, total_hours: 8, total_minutes: 480 });
  });
  it('PTO belongs to the employee, regardless of who created the request', async () => {
    const { call } = setup(role);
    const result = await call('list_pto_requests');
    expect(result.structuredContent.count).toBe(1);
    expect(result.structuredContent.requests[0]).toMatchObject({ id: 'own', hours_requested: 8, note: 'Synthetic' });
  });
  it.each(['org_members','employees'])('fails closed on %s lookup failure', async table => {
    const { call } = setup(role, table);
    expect((await call('list_time_entries', {})).isError).toBe(true);
    expect((await call('list_pto_requests')).isError).toBe(true);
  });
});
