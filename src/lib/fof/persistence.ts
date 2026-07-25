import type { FofAmounts, FofOverrides, FofPatientFields } from './types';

/**
 * Storage-ready seam for a future BAA-backed "save form" feature.
 *
 * HIPAA: saving a form snapshot means persisting PHI. That is only lawful
 * once the practice has a Business Associate Agreement with the storage
 * vendor (e.g. Supabase Team plan + HIPAA add-on). Until then the ONLY
 * adapter is printOnlyAdapter, which refuses to save. Do not add a real
 * adapter without confirming a signed BAA covers the destination.
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
