import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { consentDb, type ConsentAuditRow } from '@/lib/consents/db';
import type { ConsentAuditEntry } from '@/lib/consents/types';

/**
 * Template-activity audit trail. Records WHO changed WHICH template/bundle
 * and WHEN — never patient information. Fee-override entries carry the CDT
 * code and amounts only; there is no patient anywhere in this table.
 */

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  form_created: 'Form created',
  form_edited: 'Form edited',
  form_published: 'Form published',
  form_archived: 'Form archived',
  form_restored: 'Form restored',
  form_duplicated: 'Form duplicated',
  form_deleted: 'Form deleted',
  version_restored: 'Version restored to draft',
  bundle_created: 'Bundle created',
  bundle_changed: 'Bundle changed',
  bundle_archived: 'Bundle archived',
  bundle_restored: 'Bundle restored',
  bundle_deleted: 'Bundle deleted',
  fee_overridden: 'Fee overridden',
  settings_changed: 'Settings changed',
  samples_installed: 'Sample library installed',
};

function mapRow(row: ConsentAuditRow): ConsentAuditEntry {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type as ConsentAuditEntry['entityType'],
    entityId: row.entity_id,
    entityName: row.entity_name,
    actorName: row.actor_name,
    detail: (row.detail && typeof row.detail === 'object' && !Array.isArray(row.detail)
      ? row.detail
      : {}) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export function useConsentAudit(limit = 100) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['consent-audit', ctx?.org_id, limit],
    enabled: !!user && !!ctx && isAdmin,
    queryFn: async (): Promise<ConsentAuditEntry[]> => {
      if (!ctx) return [];
      const { data, error } = await consentDb
        .from('consent_audit_log')
        .select('*')
        .eq('org_id', ctx.org_id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

/**
 * Append an audit entry. Fire-and-forget: an audit hiccup must never block
 * the office's actual work, so failures are logged and swallowed.
 * `detail` must be de-identified facts only (versions, codes, amounts).
 */
export async function logConsentAudit(input: {
  orgId: string;
  action: string;
  entityType: 'form' | 'bundle' | 'settings' | 'packet';
  entityId?: string | null;
  entityName?: string;
  actorId?: string | null;
  actorName?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await consentDb.from('consent_audit_log').insert({
    org_id: input.orgId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    entity_name: input.entityName ?? '',
    actor_id: input.actorId ?? null,
    actor_name: input.actorName ?? '',
    detail: (input.detail ?? {}) as never,
  });
  if (error) console.warn('consent audit insert failed', error.message);
}
