import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

/**
 * Office Intelligence — the client half.
 *
 * Everything here fails open: if the function errors, hooks resolve to empty
 * and the surface renders exactly as it did before. Nothing blocks a page.
 */

export type Nudge = {
  id: string;
  surface: 'dashboard' | 'clock' | 'checklists' | 'goals' | 'training' | 'huddle' | 'deposit';
  kind: string;
  content: string;
  data_refs: Record<string, unknown>;
  status: 'new' | 'shown' | 'acted_on' | 'dismissed';
  created_at: string;
};

export type HuddleContext = {
  out_today: string[];
  scheduled_today: number;
  team_count: number;
  yesterday: {
    date: string;
    production_cents: number;
    collected_cents: number;
    cancellations: number;
    no_shows: number;
  } | null;
  closures_this_week: { date: string; name: string }[];
  meetings_this_week: { date: string; title: string }[];
  next_meeting: { date: string; title: string; days_away: number } | null;
  collections_mtd_cents: number;
  collections_target_cents: number | null;
  month_elapsed_pct: number;
};

async function callInsights<T>(action: string): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke('office-insights', {
      body: { action },
    });
    if (error) return null;
    return data as T;
  } catch {
    return null;
  }
}

/** The Office Brief. Generated once per person per day, cached server-side. */
export function useOfficeBrief() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['office-brief', ctx?.org_id, new Date().toDateString()],
    enabled: !!ctx,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await callInsights<{ brief: string | null; data_refs?: Record<string, unknown> }>('brief');
      return res ?? { brief: null };
    },
  });
}

/** Every live nudge this person is allowed to see, across surfaces. */
export function useOfficeNudges() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['office-nudges', ctx?.org_id],
    enabled: !!ctx,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await callInsights<{ nudges: Nudge[] }>('nudges');
      return res?.nudges ?? [];
    },
  });
}

/** Nudges for one surface. At most one is ever shown. */
export function useSurfaceNudge(surface: Nudge['surface']) {
  const { data, isLoading } = useOfficeNudges();
  const nudge = (data ?? []).find(n => n.surface === surface) ?? null;
  return { nudge, isLoading };
}

/**
 * The learning loop. acted_on vs dismissed is what teaches the system which
 * kinds land — kinds dismissed twice in two weeks go quiet for that person.
 */
export function useResolveNudge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'acted_on' | 'dismissed' }) => {
      const { error } = await supabase
        .from('office_nudges')
        .update({ status, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-nudges'] });
    },
  });
}

/** The computed, business-only context block above the huddle agenda. */
export function useHuddleContext() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['huddle-context', ctx?.org_id, new Date().toDateString()],
    enabled: !!ctx,
    staleTime: 15 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const res = await callInsights<{ context: HuddleContext | null }>('huddle');
      return res?.context ?? null;
    },
  });
}
