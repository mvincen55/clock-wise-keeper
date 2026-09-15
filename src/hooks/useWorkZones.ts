import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type WorkZone = {
  id: string;
  user_id: string;
  org_id: string | null;
  zone_name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  enter_delay_minutes: number;
  exit_delay_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function useWorkZones() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['work-zones', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_zones')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as WorkZone[];
    },
  });
}

type ZoneInput = {
  zone_name: string;
  latitude: number;
  longitude: number;
  radius_meters?: number;
  enter_delay_minutes?: number;
  exit_delay_minutes?: number;
  is_active?: boolean;
};

export function useCreateZone() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ZoneInput) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      // The zone belongs to the office: clock-in location is classified by
      // org, so a zone without org_id would never match a punch.
      const { error } = await supabase.from('work_zones').insert({
        ...input,
        user_id: user.id,
        org_id: ctx.org_id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-zones'] }),
  });
}

export function useUpdateZone() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WorkZone> & { id: string }) => {
      const { error } = await supabase.from('work_zones').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-zones'] }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_zones').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-zones'] }),
  });
}
