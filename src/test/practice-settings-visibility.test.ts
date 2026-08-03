import { describe, expect, it } from 'vitest';
import { normalizeCollectionsVisibility } from '@/hooks/usePracticeSettings';

// The dropdown and the vitals gate both key off 'everyone'/'admin_only'.
// Legacy rows (pre-20260803 migration) stored 'team'/'admins'; if these
// mappings break, the settings dropdown renders blank and 'admins' stops
// hiding collections from employees.

describe('normalizeCollectionsVisibility', () => {
  it('maps legacy tokens to the app vocabulary', () => {
    expect(normalizeCollectionsVisibility('team')).toBe('everyone');
    expect(normalizeCollectionsVisibility('admins')).toBe('admin_only');
  });

  it('passes current tokens through unchanged', () => {
    expect(normalizeCollectionsVisibility('everyone')).toBe('everyone');
    expect(normalizeCollectionsVisibility('admin_only')).toBe('admin_only');
  });

  it('falls back to everyone when the row is missing or empty', () => {
    expect(normalizeCollectionsVisibility(undefined)).toBe('everyone');
    expect(normalizeCollectionsVisibility(null)).toBe('everyone');
    expect(normalizeCollectionsVisibility('')).toBe('everyone');
  });
});
