import type { FofAmounts, FofOverrides, FofPatientFields } from './types';

/**
 * Print-only contract. Patient names and form data remain in browser memory.
 *
 * Product requirement: do not add a persistent adapter for patient forms.
 * A later vendor/privacy change does not itself authorize saving names.
 */

export interface FofFormSnapshot {
  templateId: string;
  patient: FofPatientFields;
  amounts: FofAmounts;
  overrides: FofOverrides;
}

export interface FofPersistenceAdapter {
  readonly canSave: boolean;
  save(snapshot: FofFormSnapshot): Promise<{ id: string }>;
}

export const printOnlyAdapter: FofPersistenceAdapter = {
  canSave: false,
  save: async () => {
    throw new Error('Saving is disabled: no BAA-covered storage is configured.');
  },
};
