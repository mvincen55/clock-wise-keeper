// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { completeTreatmentRows } from '../../supabase/functions/_shared/treatment-extraction';
import { loadEdge } from './helpers/edge-harness';

const row = { code: 'D2740', tooth: '3', description: 'Crown', fee: 100, officeFee: 120, entryDate: '1/2/2026', visit: 5 };
describe('screenshot completeness', () => {
  it('preserves order, visits and separate fee columns for complete imports', () => {
    const rows = [row, { ...row, code: 'D2950', visit: 6, officeFee: null }];
    expect(completeTreatmentRows(JSON.stringify(rows), 'stop')).toEqual(rows);
    expect(completeTreatmentRows('```json\n' + JSON.stringify(rows) + '\n```', undefined)).toEqual(rows);
  });
  it.each([
    ['over limit', JSON.stringify(Array.from({ length: 41 }, () => row)), 'stop'],
    ['truncated second row', '[' + JSON.stringify(row) + ', {"code":"D', 'stop'],
    ['missing array end', '[' + JSON.stringify(row), undefined],
    ['trailing garbage', JSON.stringify([row]) + ' [unfinished', 'stop'],
    ['missing fee field', JSON.stringify([{ ...row, fee: undefined }]), 'stop'],
    ['invalid row', JSON.stringify([row, null]), 'stop'],
    ['empty code', JSON.stringify([row, { ...row, code: '' }]), 'stop'],
    ['empty', '[]', 'stop'],
    ['gateway truncation', JSON.stringify([row]), 'length'],
    ['gateway filtering', JSON.stringify([row]), 'content_filter'],
  ])('rejects %s and returns no salvaged rows', (_name, raw, reason) => {
    expect(completeTreatmentRows(raw, reason)).toBeNull();
  });
  it('endpoint reports an actionable incomplete result, then allows a complete retry', async () => {
    const builder = { select: () => builder, eq: () => builder, limit: () => builder, maybeSingle: async () => ({ data: { org_id: 'org-a' } }) };
    const client = { auth: { getUser: async () => ({ data: { user: { id: 'a' } } }) }, rpc: async () => ({ data: true }), from: () => builder };
    const gateway = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '[' + JSON.stringify(row) + ', {' } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify([row]) } }] })));
    const { handle } = loadEdge('supabase/functions/parse-treatment/index.ts', { 'https://esm.sh/@supabase/supabase-js@2': { createClient: () => client } }, gateway);
    const request = () => new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer synthetic' }, body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }) });
    const incomplete = await handle(request());
    expect(incomplete.status).toBe(422);
    const body = await incomplete.json();
    expect(body).toMatchObject({ status: 'incomplete', code: 'INCOMPLETE_IMPORT' });
    expect(body.error).toContain('Nothing was imported');
    expect(body).not.toHaveProperty('rows');
    const complete = await handle(request());
    expect(await complete.json()).toEqual({ status: 'complete', rows: [row] });
  });
});
