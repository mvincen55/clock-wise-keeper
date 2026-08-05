import { describe, it, expect } from 'vitest';
import {
  PROVIDER_TYPES,
  isProviderType,
  sortProviders,
  activeProviders,
  activeDoctorNames,
  type Provider,
} from '@/lib/providers';

function p(partial: Partial<Provider> & { id: string }): Provider {
  return {
    orgId: 'org',
    displayName: partial.displayName ?? partial.id,
    providerType: 'doctor',
    employeeId: null,
    active: true,
    sortOrder: 0,
    ...partial,
  };
}

describe('provider types', () => {
  it('recognizes valid types', () => {
    for (const t of PROVIDER_TYPES) expect(isProviderType(t)).toBe(true);
    expect(isProviderType('surgeon')).toBe(false);
    expect(isProviderType(3)).toBe(false);
  });
});

describe('sortProviders', () => {
  it('orders by sort_order then name', () => {
    const list = [
      p({ id: 'b', displayName: 'Dr. Young', sortOrder: 1 }),
      p({ id: 'a', displayName: 'Dr. Adams', sortOrder: 0 }),
      p({ id: 'c', displayName: 'Dr. Baker', sortOrder: 0 }),
    ];
    expect(sortProviders(list).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('activeProviders / activeDoctorNames', () => {
  it('drops inactive providers', () => {
    const list = [
      p({ id: 'a', displayName: 'Dr. Adams', sortOrder: 0 }),
      p({ id: 'b', displayName: 'Dr. Gone', active: false, sortOrder: 1 }),
    ];
    expect(activeProviders(list).map((x) => x.id)).toEqual(['a']);
  });

  it('mirrors the doctor_names cache (active doctors only, in order)', () => {
    const list = [
      p({ id: 'h', displayName: 'Hy Gienist', providerType: 'hygienist', sortOrder: 0 }),
      p({ id: 'd2', displayName: 'Dr. Young', sortOrder: 2 }),
      p({ id: 'd1', displayName: 'Dr. Adams', sortOrder: 1 }),
      p({ id: 'd3', displayName: 'Dr. Retired', active: false, sortOrder: 3 }),
    ];
    expect(activeDoctorNames(list)).toEqual(['Dr. Adams', 'Dr. Young']);
  });
});
