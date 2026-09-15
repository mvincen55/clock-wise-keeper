// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadOfficeProfile, OFFICE_PROFILE_PREAMBLE } from '../../supabase/functions/_shared/office-knowledge';

// The office profile is how the AI learns the office's own configuration.
// These tests pin its three promises: every read is org-filtered, secrets
// and patient-shaped text never leave, and a failed read never blocks.

const orgId = '11111111-1111-4111-8111-111111111111';

function client(rows: Record<string, unknown>, failing: string[] = []) {
  const filters = vi.fn();
  const from = (table: string) => {
    const result = () =>
      failing.includes(table)
        ? { data: null, error: { message: 'boom' } }
        : { data: rows[table] ?? (table.endsWith('settings') || table === 'org_branding' ? null : []), error: null };
    const builder: Record<string, unknown> = {
      then: (fn: (v: unknown) => unknown) => Promise.resolve(result()).then(fn),
      maybeSingle: async () => result(),
    };
    for (const m of ['select', 'eq', 'neq', 'is', 'not', 'gte', 'lte', 'order', 'limit']) {
      builder[m] = (...args: unknown[]) => { filters(table, m, ...args); return builder; };
    }
    return builder;
  };
  return { from, filters };
}

describe('loadOfficeProfile', () => {
  it('filters every table it reads by the caller org', async () => {
    const c = client({});
    await loadOfficeProfile(c as never, orgId);
    const tables = new Set(c.filters.mock.calls.map((call) => call[0]));
    expect(tables.size).toBeGreaterThan(15);
    for (const table of tables) {
      expect(c.filters).toHaveBeenCalledWith(table, 'eq', 'org_id', orgId);
    }
  });

  it('renders settings as a bounded, cited block', async () => {
    const c = client({
      org_branding: { display_name: 'Harbor Dental', phone: '555-0100' },
      broken_appt_settings: { module_nav_label: 'Broken Appointments', notice_business_hours: 48, fee_amount: 75 },
      correspondence_settings: { default_closing: 'Warm regards,', default_signer_name: 'Office Manager' },
      org_providers: [{ display_name: 'Dr. Rivera', provider_type: 'dentist', schedule_code: 'DR' }],
      office_closures: [{ closure_date: '2099-12-24', name: 'Holiday', is_full_day: true }],
    });
    const block = await loadOfficeProfile(c as never, orgId);
    expect(block).toContain('Practice: Harbor Dental');
    expect(block).toContain('Required notice: 48 business hours');
    expect(block).toContain('Fee: $75.00');
    expect(block).toContain('Default letter closing: "Warm regards,"');
    expect(block).toContain('Dr. Rivera');
    expect(block).toContain('2099-12-24: Holiday');
    expect(OFFICE_PROFILE_PREAMBLE).toMatch(/authoritative/);
  });

  it('lists important numbers by label only — values never leave the app', async () => {
    const c = client({
      important_numbers: [{ section: 'Carriers', tab: 'Insurance', label: 'Delta portal login', value: 'SECRET-VALUE-123' }],
    });
    const block = await loadOfficeProfile(c as never, orgId);
    expect(block).toContain('Delta portal login');
    expect(block).not.toContain('SECRET-VALUE-123');
    const selects = c.filters.mock.calls.filter((call) => call[0] === 'important_numbers' && call[1] === 'select');
    expect(String(selects[0][2])).not.toMatch(/value|notes/);
  });

  it('scrubs person-level text in staff-authored fields', async () => {
    const c = client({
      checklists: [{ id: 'c1', name: 'Morning', audience: 'all' }],
      checklist_items: [{ checklist_id: 'c1', title: 'Call Sarah Whitman about her crown', cadence: 'daily', per_person: false }],
    });
    const block = await loadOfficeProfile(c as never, orgId);
    expect(block).not.toContain('Sarah Whitman');
    expect(block).toContain('[a person]');
  });

  it('skips a failing read instead of failing the whole profile', async () => {
    const c = client({ org_branding: { display_name: 'Harbor Dental' } }, ['checklists', 'knowledge_items', 'employees']);
    const block = await loadOfficeProfile(c as never, orgId);
    expect(block).toContain('Practice: Harbor Dental');
  });

  it('returns an empty string when nothing is configured', async () => {
    const c = client({});
    expect(await loadOfficeProfile(c as never, orgId)).toBe('');
  });
});
