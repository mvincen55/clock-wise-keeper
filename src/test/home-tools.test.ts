/**
 * The tools area — the assigned role first, today's coverage, management
 * for admins, backup roles and the long tail on request; one destination
 * once; nothing a tier cannot open, unless a grant says so.
 */
import { describe, expect, it } from 'vitest';
import { buildToolGroups, EVERYONE_TOOLS, MANAGEMENT_TOOLS } from '@/components/dashboard/tools';

describe('buildToolGroups', () => {
  it('a member with an assigned role: the role first (open), then everyone (on request); no management tools', () => {
    const groups = buildToolGroups({ tier: 'member', primary: 'front_desk', secondary: [], coveringToday: [] });
    expect(groups.map(g => [g.id, g.emphasis])).toEqual([['role:front_desk', 'primary'], ['everyone', 'secondary']]);
    expect(groups[0].note).toBe('Assigned');
    expect(groups[0].tools.map(t => t.to)).toContain('/fof');
    expect(groups.flatMap(g => g.tools).some(t => t.to === '/management' || t.to === '/reports')).toBe(false);
  });

  it('a backup role stays a capability: its tools are revealed on request and never marked as today’s', () => {
    const groups = buildToolGroups({ tier: 'member', primary: 'front_desk', secondary: ['dental_assistant'], coveringToday: [] });
    const backup = groups.find(g => g.id === 'backup:dental_assistant')!;
    expect(backup.emphasis).toBe('secondary');
    expect(backup.note).toMatch(/not assigned today/);
    expect(groups.find(g => g.id === 'covering:dental_assistant')).toBeUndefined();
  });

  it('a role covered today is open, right after the assigned role', () => {
    const groups = buildToolGroups({ tier: 'member', primary: 'front_desk', secondary: ['dental_assistant'], coveringToday: ['dental_assistant'] });
    expect(groups.map(g => g.id).slice(0, 2)).toEqual(['role:front_desk', 'covering:dental_assistant']);
    expect(groups[1]).toMatchObject({ emphasis: 'primary', note: 'Covering today' });
  });

  it('a destination appears once — the first group keeps it', () => {
    const groups = buildToolGroups({ tier: 'member', primary: 'front_desk', secondary: ['treatment_coordinator'], coveringToday: ['treatment_coordinator'] });
    const all = groups.flatMap(g => g.tools.map(t => t.to));
    expect(new Set(all).size).toBe(all.length);
    expect(groups.find(g => g.id === 'role:front_desk')!.tools.some(t => t.to === '/fof')).toBe(true);
    expect(groups.find(g => g.id === 'covering:treatment_coordinator')!.tools.some(t => t.to === '/fof')).toBe(false);
    // Checklists live in the everyone group unless a role already carried them.
    expect(groups.find(g => g.id === 'everyone')!.tools.some(t => t.to === '/checklists')).toBe(true);
  });

  it('managers get the management group open; owners too; a member only through a grant', () => {
    const manager = buildToolGroups({ tier: 'manager', primary: 'office_manager', secondary: [], coveringToday: [] });
    const management = manager.find(g => g.id === 'management')!;
    expect(management.emphasis).toBe('primary');
    expect(management.tools.map(t => t.to)).toContain('/management/attendance');
    expect(manager.find(g => g.id === 'role:office_manager')!.tools.map(t => t.to)).toContain('/management?kind=decide');

    const granted = buildToolGroups({ tier: 'member', primary: 'hygienist', secondary: [], coveringToday: [], grants: new Set(['view_reports']) });
    const g = granted.find(x => x.id === 'management')!;
    expect(g.emphasis).toBe('secondary');
    expect(g.tools.map(t => t.to)).toEqual(['/reports']);
  });

  it('no role at all: everyone’s essentials are the open group', () => {
    const groups = buildToolGroups({ tier: 'member', primary: null, secondary: [], coveringToday: [] });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ id: 'everyone', emphasis: 'primary' });
    expect(groups[0].tools).toHaveLength(EVERYONE_TOOLS.length);
  });

  it('every management tool is tier-gated or open to everyone', () => {
    for (const t of MANAGEMENT_TOOLS) expect(t.minTier === 'manager' || ['/deposit-log', '/fof'].includes(t.to), t.id).toBe(true);
  });
});
