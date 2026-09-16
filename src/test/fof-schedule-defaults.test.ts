import { describe, expect, it } from 'vitest';
import { revertsToOfficeFeesOnMax } from '@/lib/fof/schedule-defaults';

const plan = (feeScheduleId: string, officeFeesAfterMax: boolean, isActive = true) => ({ feeScheduleId, officeFeesAfterMax, isActive });

describe('office fees after the annual max follow the selected carrier schedule', () => {
  it('turns on for Altus by name, with or without a saved plan', () => {
    expect(revertsToOfficeFeesOnMax('s1', 'Altus', [])).toBe(true);
    expect(revertsToOfficeFeesOnMax('s1', 'Altus Dental PPO', undefined)).toBe(true);
    expect(revertsToOfficeFeesOnMax('s1', 'altus', [plan('s1', false)])).toBe(true);
  });
  it('turns on when an active linked plan says so', () => {
    expect(revertsToOfficeFeesOnMax('s2', 'Delta Dental Premier', [plan('s2', true)])).toBe(true);
  });
  it('stays off for other carriers, inactive plans, and plans linked elsewhere', () => {
    expect(revertsToOfficeFeesOnMax('s2', 'Delta Dental Premier', [plan('s2', false)])).toBe(false);
    expect(revertsToOfficeFeesOnMax('s2', 'Delta Dental Premier', [plan('s2', true, false)])).toBe(false);
    expect(revertsToOfficeFeesOnMax('s2', 'Delta Dental Premier', [plan('s1', true)])).toBe(false);
    expect(revertsToOfficeFeesOnMax('s2', 'Saltus Reinsurance', [])).toBe(false);
    expect(revertsToOfficeFeesOnMax('s2', undefined, [])).toBe(false);
  });
});
