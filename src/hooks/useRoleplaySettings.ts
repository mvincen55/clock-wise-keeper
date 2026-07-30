import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type PersonaStyle = 'gentle' | 'balanced' | 'challenging' | 'skeptical';
export type PolicyTone = 'warm_professional' | 'plainspoken' | 'formal' | 'concierge';

export type RoleplaySettings = {
  roleplay_persona_style: PersonaStyle;
  roleplay_policy_tone: PolicyTone;
  roleplay_notes: string | null;
};

export const PERSONA_STYLES: { value: PersonaStyle; label: string; description: string }[] = [
  { value: 'gentle', label: 'Gentle', description: 'Cooperative patients — good for brand-new team members.' },
  { value: 'balanced', label: 'Balanced', description: 'Realistic mix of easy and awkward moments.' },
  { value: 'challenging', label: 'Challenging', description: 'Interruptions, pushback, and hard follow-ups.' },
  { value: 'skeptical', label: 'Skeptical', description: 'Price-sensitive, distrustful, tests every answer.' },
];

export const POLICY_TONES: { value: PolicyTone; label: string; description: string }[] = [
  { value: 'warm_professional', label: 'Warm professional', description: 'Friendly, reassuring, still precise.' },
  { value: 'plainspoken', label: 'Plainspoken', description: 'Direct and simple — no jargon, no fluff.' },
  { value: 'formal', label: 'Formal', description: 'Careful, clinical, buttoned-up language.' },
  { value: 'concierge', label: 'Concierge', description: 'High-touch, boutique, anticipates the next need.' },
];

const DEFAULTS: RoleplaySettings = {
  roleplay_persona_style: 'balanced',
  roleplay_policy_tone: 'warm_professional',
  roleplay_notes: null,
};

/** The office-level configuration that shapes every roleplay assessment. */
export function useRoleplaySettings() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['roleplay-settings', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async (): Promise<RoleplaySettings> => {
      const { data, error } = await supabase
        .from('org_practice_settings')
        .select('roleplay_persona_style, roleplay_policy_tone, roleplay_notes')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULTS;
      return {
        roleplay_persona_style: (data.roleplay_persona_style as PersonaStyle) ?? DEFAULTS.roleplay_persona_style,
        roleplay_policy_tone: (data.roleplay_policy_tone as PolicyTone) ?? DEFAULTS.roleplay_policy_tone,
        roleplay_notes: data.roleplay_notes ?? null,
      };
    },
  });
}

export function useSaveRoleplaySettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: RoleplaySettings) => {
      if (!ctx) throw new Error('No organization');
      const { error } = await supabase
        .from('org_practice_settings')
        .upsert(
          {
            org_id: ctx.org_id,
            roleplay_persona_style: settings.roleplay_persona_style,
            roleplay_policy_tone: settings.roleplay_policy_tone,
            roleplay_notes: settings.roleplay_notes?.trim() || null,
          },
          { onConflict: 'org_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roleplay-settings'] });
    },
  });
}
