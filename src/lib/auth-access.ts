export interface AllowedUserRpcResult {
  data: unknown;
  error: unknown;
}

/**
 * Fail closed when the allowlist lookup cannot be completed. Authentication
 * loading must still finish so callers can show a real error instead of an
 * endless spinner.
 */
export async function resolveAllowedUser(
  user: { id: string } | null,
  query: () => PromiseLike<AllowedUserRpcResult>,
): Promise<boolean> {
  if (!user) return false;

  try {
    const { data, error } = await query();
    return !error && data === true;
  } catch {
    return false;
  }
}
