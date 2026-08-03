import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { consentDb, type ConsentSettingsRow } from '@/lib/consents/db';
import { logConsentAudit } from '@/hooks/useConsentAudit';
import { DEFAULT_CONSENT_SETTINGS, type ConsentSettings } from '@/lib/consents/types';

/**
 * Office rules for Forms & Consents. Everything is a setting: permissions,
 * signature rules, and the privacy timeout all live here so no behavior is
 * hard-coded for one office. Defaults apply until the org saves a row.
 */

function mapRow(row: ConsentSettingsRow): ConsentSettings {
  return {
    clearTimeoutMinutes: row.clear_timeout_minutes,
    warnBeforeClear: row.warn_before_clear,
    teamCanUpload: row.team_can_upload,
    teamCanEditTemplates: row.team_can_edit_templates,
    teamCanPublish: row.team_can_publish,
    teamCanArchive: row.team_can_archive,
    teamCanCreateBundles: row.team_can_create_bundles,
    teamCanOverrideFees: row.team_can_override_fees,
    teamCanPrint: row.team_can_print,
    teamCanChangeSignatures: row.team_can_change_signatures,
    requireWitnessDefault: row.require_witness_default,
    requireGuardianForMinors: row.require_guardian_for_minors,
    financialFormId: row.financial_form_id,
    alwaysOfferFinancial: row.always_offer_financial,
  };
}

export function useConsentSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['consent-settings', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ConsentSettings> => {
      if (!ctx) return DEFAULT_CONSENT_SETTINGS;
      const { data, error } = await consentDb
        .from('consent_settings')
        .select('*')
        .eq('org_id', ctx.org_id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data) : DEFAULT_CONSENT_SETTINGS;
    },
  });
}

export function useUpdateConsentSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<ConsentSettings>) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { error } = await consentDb.from('consent_settings').upsert(
        {
          org_id: ctx.org_id,
          ...(updates.clearTimeoutMinutes !== undefined && { clear_timeout_minutes: updates.clearTimeoutMinutes }),
          ...(updates.warnBeforeClear !== undefined && { warn_before_clear: updates.warnBeforeClear }),
          ...(updates.teamCanUpload !== undefined && { team_can_upload: updates.teamCanUpload }),
          ...(updates.teamCanEditTemplates !== undefined && { team_can_edit_templates: updates.teamCanEditTemplates }),
          ...(updates.teamCanPublish !== undefined && { team_can_publish: updates.teamCanPublish }),
          ...(updates.teamCanArchive !== undefined && { team_can_archive: updates.teamCanArchive }),
          ...(updates.teamCanCreateBundles !== undefined && { team_can_create_bundles: updates.teamCanCreateBundles }),
          ...(updates.teamCanOverrideFees !== undefined && { team_can_override_fees: updates.teamCanOverrideFees }),
          ...(updates.teamCanPrint !== undefined && { team_can_print: updates.teamCanPrint }),
          ...(updates.teamCanChangeSignatures !== undefined && { team_can_change_signatures: updates.teamCanChangeSignatures }),
          ...(updates.requireWitnessDefault !== undefined && { require_witness_default: updates.requireWitnessDefault }),
          ...(updates.requireGuardianForMinors !== undefined && { require_guardian_for_minors: updates.requireGuardianForMinors }),
          ...(updates.financialFormId !== undefined && { financial_form_id: updates.financialFormId }),
          ...(updates.alwaysOfferFinancial !== undefined && { always_offer_financial: updates.alwaysOfferFinancial }),
          updated_by: user.id,
        },
        { onConflict: 'org_id' },
      );
      if (error) throw error;
      void logConsentAudit({
        orgId: ctx.org_id,
        action: 'settings_changed',
        entityType: 'settings',
        actorId: user.id,
        actorName: user.email ?? '',
        detail: { fields: Object.keys(updates) },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-settings'] }),
  });
}

export type ConsentAbility =
  | 'upload'
  | 'editTemplates'
  | 'publish'
  | 'archive'
  | 'createBundles'
  | 'overrideFees'
  | 'print'
  | 'changeSignatures';

/**
 * The one place that answers "may this member do that here?".
 * Owners and managers may do everything; the Team tier follows the
 * office's permission settings.
 */
export function useConsentPermissions() {
  const { data: ctx } = useOrgContext();
  const { data: settings = DEFAULT_CONSENT_SETTINGS, isLoading } = useConsentSettings();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const can = (ability: ConsentAbility): boolean => {
    if (isManager) return true;
    switch (ability) {
      case 'upload': return settings.teamCanUpload;
      case 'editTemplates': return settings.teamCanEditTemplates;
      case 'publish': return settings.teamCanPublish;
      case 'archive': return settings.teamCanArchive;
      case 'createBundles': return settings.teamCanCreateBundles;
      case 'overrideFees': return settings.teamCanOverrideFees;
      case 'print': return settings.teamCanPrint;
      case 'changeSignatures': return settings.teamCanChangeSignatures;
      default: return false;
    }
  };

  return { can, isManager, settings, isLoading };
}
