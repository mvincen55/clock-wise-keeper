/**
 * Canonical provider registry model (org_providers). One source of truth for
 * treating providers used by FOF today and the Forms workflow next. Providers
 * may be doctors, hygienists, assistants, or other clinicians; may have no
 * login; and inactive providers are retained so historical documents keep the
 * name that appeared when they were produced.
 */

export const PROVIDER_TYPES = ['doctor', 'hygienist', 'assistant', 'other'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const PROVIDER_TYPE_LABELS: Record<ProviderType, string> = {
  doctor: 'Doctor',
  hygienist: 'Hygienist',
  assistant: 'Assistant',
  other: 'Other clinician',
};

export type Provider = {
  id: string;
  orgId: string;
  displayName: string;
  providerType: ProviderType;
  employeeId: string | null;
  active: boolean;
  sortOrder: number;
};

export function isProviderType(value: unknown): value is ProviderType {
  return typeof value === 'string' && (PROVIDER_TYPES as readonly string[]).includes(value);
}

/** Stable ordering used everywhere providers are listed. */
export function sortProviders(providers: Provider[]): Provider[] {
  return [...providers].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName),
  );
}

/** Active providers only, ordered — for selection dropdowns. */
export function activeProviders(providers: Provider[]): Provider[] {
  return sortProviders(providers.filter((p) => p.active));
}

/**
 * Active doctor display names in registry order — mirrors what the compatibility
 * trigger writes into `fof_settings.doctor_names`, so the client and DB agree.
 */
export function activeDoctorNames(providers: Provider[]): string[] {
  return activeProviders(providers)
    .filter((p) => p.providerType === 'doctor')
    .map((p) => p.displayName);
}
