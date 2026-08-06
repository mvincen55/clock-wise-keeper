import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  activeDoctorNames,
  activeProviders,
  sortProviders,
  type Provider,
  type ProviderType,
} from '@/lib/providers';
import type { TablesUpdate } from '@/integrations/supabase/types';

function mapRow(r: {
  id: string;
  org_id: string;
  display_name: string;
  provider_type: string;
  employee_id: string | null;
  active: boolean;
  sort_order: number;
}): Provider {
  return {
    id: r.id,
    orgId: r.org_id,
    displayName: r.display_name,
    providerType: r.provider_type as ProviderType,
    employeeId: r.employee_id,
    active: r.active,
    sortOrder: r.sort_order,
  };
}

/** Every provider in the org (active and inactive), ordered. */
export function useProviders() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-providers', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Provider[]> => {
      const { data, error } = await supabase
        .from('org_providers')
        .select('id, org_id, display_name, provider_type, employee_id, active, sort_order')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      return sortProviders((data ?? []).map(mapRow));
    },
  });
}

/** Active providers only — for treating-provider dropdowns. */
export function useActiveProviders(): Provider[] {
  const { data: providers } = useProviders();
  return useMemo(() => activeProviders(providers ?? []), [providers]);
}

/**
 * Compatibility adapter: active doctor names in registry order. Mirrors what the
 * DB trigger writes into `fof_settings.doctor_names`, so FOF can migrate to the
 * registry without a behavior change. Temporary — retired with `doctor_names`.
 */
export function useDoctorNamesFromRegistry(): string[] {
  const { data: providers } = useProviders();
  return useMemo(() => activeDoctorNames(providers ?? []), [providers]);
}

function useInvalidateProviders() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['org-providers'] });
    // doctor_names is kept in sync by a DB trigger; refresh FOF reads too.
    qc.invalidateQueries({ queryKey: ['fof-policy-settings'] });
    qc.invalidateQueries({ queryKey: ['fof-settings'] });
  };
}

export function useAddProvider() {
  const { data: ctx } = useOrgContext();
  const { data: providers } = useProviders();
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: async (input: { displayName: string; providerType: ProviderType }) => {
      if (!ctx) throw new Error('Not authenticated');
      const nextOrder = (providers ?? []).reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;
      const { error } = await supabase.from('org_providers').insert({
        org_id: ctx.org_id,
        display_name: input.displayName.trim(),
        provider_type: input.providerType,
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateProvider() {
  const invalidate = useInvalidateProviders();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      displayName?: string;
      providerType?: ProviderType;
      employeeId?: string | null;
      active?: boolean;
      sortOrder?: number;
    }) => {
      const patch: TablesUpdate<'org_providers'> = {};
      if (input.displayName !== undefined) patch.display_name = input.displayName.trim();
      if (input.providerType !== undefined) patch.provider_type = input.providerType;
      if (input.employeeId !== undefined) patch.employee_id = input.employeeId;
      if (input.active !== undefined) patch.active = input.active;
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
      const { error } = await supabase.from('org_providers').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
