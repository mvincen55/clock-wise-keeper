import { describe, expect, it, vi } from 'vitest';
import { resolveAllowedUser } from '@/lib/auth-access';

describe('resolveAllowedUser', () => {
  it('fails closed instead of throwing when the allowlist request rejects', async () => {
    const query = vi.fn().mockRejectedValue(new Error('temporary network failure'));

    await expect(resolveAllowedUser({ id: 'user-1' }, query)).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('allows only an explicit successful true response', async () => {
    await expect(resolveAllowedUser({ id: 'user-1' }, async () => ({ data: true, error: null }))).resolves.toBe(true);
    await expect(resolveAllowedUser({ id: 'user-1' }, async () => ({ data: false, error: null }))).resolves.toBe(false);
    await expect(resolveAllowedUser({ id: 'user-1' }, async () => ({ data: true, error: new Error('denied') }))).resolves.toBe(false);
  });
});
