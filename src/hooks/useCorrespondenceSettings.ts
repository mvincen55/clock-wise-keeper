import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { letterDb, type CorrespondenceSettingsRow } from '@/lib/letters/db';
import {
  DEFAULT_CORRESPONDENCE_SETTINGS,
  type CorrespondenceSettings,
} from '@/lib/letters/types';

/**
 * Office rules for Letterhead & Correspondence. Everything is a setting:
 * closing, office signer, school/work-note wording, and the team template
 * permission all live here so no behavior is hard-coded for one office.
 * Defaults apply until the org saves a row. De-identified configuration
 * only — no patient data ever flows through this hook.
 */

function mapRow(row: CorrespondenceSettingsRow): CorrespondenceSettings {
  return {
    defaultClosing: row.default_closing,
    defaultSignerName: row.default_signer_name,
    defaultSignerTitle: row.default_signer_title,
    schoolNoteWording: row.school_note_wording,
    workNoteWording: row.work_note_wording,
    teamCanManageTemplates: row.team_can_manage_templates,
  };
}

export function useCorrespondenceSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['correspondence-settings', ctx?.org_id],
    enabled: !!user && !!ctx,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CorrespondenceSettings> => {
      // Explicit row generic: '*' inference degrades to {} for this table
      // under the narrow letterDb cast (tsc 5.8 + postgrest-js 2.96).
      const { data, error } = await letterDb
        .from('correspondence_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle<CorrespondenceSettingsRow>();
      if (error) throw error;
      return data ? mapRow(data) : DEFAULT_CORRESPONDENCE_SETTINGS;
    },
  });
}

export function useUpdateCorrespondenceSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<CorrespondenceSettings>) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { error } = await letterDb.from('correspondence_settings').upsert(
        {
          org_id: ctx.org_id,
          ...(patch.defaultClosing !== undefined && { default_closing: patch.defaultClosing }),
          ...(patch.defaultSignerName !== undefined && { default_signer_name: patch.defaultSignerName }),
          ...(patch.defaultSignerTitle !== undefined && { default_signer_title: patch.defaultSignerTitle }),
          ...(patch.schoolNoteWording !== undefined && { school_note_wording: patch.schoolNoteWording }),
          ...(patch.workNoteWording !== undefined && { work_note_wording: patch.workNoteWording }),
          ...(patch.teamCanManageTemplates !== undefined && {
            team_can_manage_templates: patch.teamCanManageTemplates,
          }),
          updated_by: user.id,
        },
        { onConflict: 'org_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['correspondence-settings'] }),
  });
}

/**
 * The one place that answers "may this member manage saved letters?".
 * Owners and managers always may; the Team tier follows the office setting.
 * The database enforces the same rule through RLS (correspondence_team_can)
 * — this hook only decides what the UI offers.
 */
export function useCorrespondencePermissions() {
  const { data: ctx } = useOrgContext();
  const { data: settings = DEFAULT_CORRESPONDENCE_SETTINGS, isLoading } =
    useCorrespondenceSettings();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  return {
    isManager,
    canManageTemplates: isManager || settings.teamCanManageTemplates,
    settings,
    isLoading,
  };
}
