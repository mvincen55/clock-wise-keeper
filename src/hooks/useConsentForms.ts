import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { consentDb, type ConsentFormRow, type ConsentFormVersionRow } from '@/lib/consents/db';
import { logConsentAudit } from '@/hooks/useConsentAudit';
import {
  deriveSignatureFacts,
  type ConsentForm,
  type ConsentFormVersion,
  type ConsentTemplateContent,
  type FormCategory,
} from '@/lib/consents/types';
import { SAMPLE_BUNDLES, SAMPLE_TEMPLATES, SAMPLE_REVIEW_NOTE } from '@/lib/consents/demo-content';

/**
 * Consent form templates: the office's library, drafts, and published
 * version history. Templates only — the temporary patient values from the
 * Complete Forms workflow never touch these hooks or tables.
 */

function parseContent(value: unknown): ConsentTemplateContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const blocks = (value as { blocks?: unknown }).blocks;
  return Array.isArray(blocks) ? ({ blocks } as ConsentTemplateContent) : null;
}

function mapForm(row: ConsentFormRow): ConsentForm {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    category: row.category as FormCategory,
    status: row.status as ConsentForm['status'],
    procedureCodes: row.procedure_codes ?? [],
    editableBy: row.editable_by as ConsentForm['editableBy'],
    requiresPatientSignature: row.requires_patient_signature,
    requiresDoctorSignature: row.requires_doctor_signature,
    requiresWitnessSignature: row.requires_witness_signature,
    requiresGuardianSignature: row.requires_guardian_signature,
    hygienistMayComplete: row.hygienist_may_complete,
    includesCost: row.includes_cost,
    isFinancial: row.is_financial,
    isSample: row.is_sample,
    needsReview: row.needs_review,
    source: row.source as ConsentForm['source'],
    currentVersion: row.current_version,
    publishedContent: parseContent(row.published_content),
    draftContent: parseContent(row.draft_content),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersion(row: ConsentFormVersionRow): ConsentFormVersion {
  return {
    id: row.id,
    formId: row.form_id,
    version: row.version,
    content: parseContent(row.content) ?? { blocks: [] },
    changeNotes: row.change_notes,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
  };
}

/** Signature/cost flag patch derived from content, applied on publish. */
function factsPatch(content: ConsentTemplateContent) {
  const facts = deriveSignatureFacts(content);
  return {
    requires_patient_signature: facts.patient,
    requires_doctor_signature: facts.doctor,
    requires_witness_signature: facts.witness,
    requires_guardian_signature: facts.guardian,
    includes_cost: facts.includesCost,
  };
}

export function useConsentForms() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['consent-forms', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ConsentForm[]> => {
      if (!ctx) return [];
      const { data, error } = await consentDb
        .from('consent_forms')
        .select('*')
        .eq('org_id', ctx.org_id)
        .order('name');
      if (error) throw error;
      return (data ?? []).map(mapForm);
    },
  });
}

export function useConsentForm(formId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['consent-form', formId],
    enabled: !!user && !!formId,
    queryFn: async (): Promise<ConsentForm | null> => {
      const { data, error } = await consentDb
        .from('consent_forms')
        .select('*')
        .eq('id', formId!)
        .maybeSingle();
      if (error) throw error;
      return data ? mapForm(data) : null;
    },
  });
}

export function useConsentFormVersions(formId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['consent-form-versions', formId],
    enabled: !!user && !!formId,
    queryFn: async (): Promise<ConsentFormVersion[]> => {
      const { data, error } = await consentDb
        .from('consent_form_versions')
        .select('*')
        .eq('form_id', formId!)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapVersion);
    },
  });
}

interface CreateFormInput {
  name: string;
  category: FormCategory;
  content: ConsentTemplateContent;
  procedureCodes?: string[];
  isFinancial?: boolean;
  needsReview?: boolean;
  source?: 'manual' | 'upload' | 'duplicate';
  auditAction?: string;
}

export function useCreateConsentForm() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFormInput): Promise<ConsentForm> => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { data, error } = await consentDb
        .from('consent_forms')
        .insert({
          org_id: ctx.org_id,
          name: input.name,
          category: input.category,
          status: 'draft',
          procedure_codes: input.procedureCodes ?? [],
          is_financial: input.isFinancial ?? input.category === 'financial',
          needs_review: input.needsReview ?? false,
          source: input.source ?? 'manual',
          draft_content: input.content as never,
          ...factsPatch(input.content),
          created_by: user.id,
          updated_by: user.id,
        })
        .select('*')
        .single();
      if (error) throw error;
      void logConsentAudit({
        orgId: ctx.org_id,
        action: input.auditAction ?? 'form_created',
        entityType: 'form',
        entityId: data.id,
        entityName: input.name,
        actorId: user.id,
        actorName: user.email ?? '',
        detail: { source: input.source ?? 'manual' },
      });
      return mapForm(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-forms'] }),
  });
}

/** Metadata + draft updates. Draft saves do not create versions. */
export function useUpdateConsentForm() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      category?: FormCategory;
      procedureCodes?: string[];
      editableBy?: 'managers' | 'everyone';
      hygienistMayComplete?: boolean;
      isFinancial?: boolean;
      draftContent?: ConsentTemplateContent | null;
      needsReview?: boolean;
      audit?: { action: string; detail?: Record<string, unknown> };
      entityName?: string;
    }) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { error } = await consentDb
        .from('consent_forms')
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.procedureCodes !== undefined && { procedure_codes: input.procedureCodes }),
          ...(input.editableBy !== undefined && { editable_by: input.editableBy }),
          ...(input.hygienistMayComplete !== undefined && { hygienist_may_complete: input.hygienistMayComplete }),
          ...(input.isFinancial !== undefined && { is_financial: input.isFinancial }),
          ...(input.draftContent !== undefined && { draft_content: input.draftContent as never }),
          ...(input.needsReview !== undefined && { needs_review: input.needsReview }),
          updated_by: user.id,
        })
        .eq('id', input.id);
      if (error) throw error;
      if (input.audit) {
        void logConsentAudit({
          orgId: ctx.org_id,
          action: input.audit.action,
          entityType: 'form',
          entityId: input.id,
          entityName: input.entityName ?? input.name ?? '',
          actorId: user.id,
          actorName: user.email ?? '',
          detail: input.audit.detail,
        });
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['consent-forms'] });
      qc.invalidateQueries({ queryKey: ['consent-form', vars.id] });
    },
  });
}

/**
 * Publish: snapshot the content as the next version, promote it to the
 * form row, clear the draft and the needs-review flag. The prior version
 * is never overwritten — it stays in consent_form_versions.
 */
export function usePublishConsentForm() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      form: ConsentForm;
      content: ConsentTemplateContent;
      changeNotes: string;
    }) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const nextVersion = input.form.currentVersion + 1;
      const { error: versionError } = await consentDb.from('consent_form_versions').insert({
        org_id: ctx.org_id,
        form_id: input.form.id,
        version: nextVersion,
        content: input.content as never,
        change_notes: input.changeNotes,
        published_by: user.id,
      });
      if (versionError) throw versionError;

      const { error } = await consentDb
        .from('consent_forms')
        .update({
          status: 'published',
          current_version: nextVersion,
          published_content: input.content as never,
          draft_content: null,
          needs_review: false,
          ...factsPatch(input.content),
          updated_by: user.id,
        })
        .eq('id', input.form.id);
      if (error) throw error;

      void logConsentAudit({
        orgId: ctx.org_id,
        action: 'form_published',
        entityType: 'form',
        entityId: input.form.id,
        entityName: input.form.name,
        actorId: user.id,
        actorName: user.email ?? '',
        detail: { version: nextVersion, changeNotes: input.changeNotes },
      });
      return nextVersion;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ['consent-forms'] });
      qc.invalidateQueries({ queryKey: ['consent-form', vars.form.id] });
      qc.invalidateQueries({ queryKey: ['consent-form-versions', vars.form.id] });
    },
  });
}

export function useArchiveConsentForm() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { form: ConsentForm; archive: boolean }) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { error } = await consentDb
        .from('consent_forms')
        .update({
          // Restoring lands on published/draft depending on version history.
          status: input.archive ? 'archived' : input.form.currentVersion > 0 ? 'published' : 'draft',
          updated_by: user.id,
        })
        .eq('id', input.form.id);
      if (error) throw error;
      void logConsentAudit({
        orgId: ctx.org_id,
        action: input.archive ? 'form_archived' : 'form_restored',
        entityType: 'form',
        entityId: input.form.id,
        entityName: input.form.name,
        actorId: user.id,
        actorName: user.email ?? '',
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-forms'] }),
  });
}

export function useDuplicateConsentForm() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (form: ConsentForm): Promise<ConsentForm> => {
      if (!ctx || !user) throw new Error('Not signed in');
      const content = form.draftContent ?? form.publishedContent ?? { blocks: [] };
      const { data, error } = await consentDb
        .from('consent_forms')
        .insert({
          org_id: ctx.org_id,
          name: `${form.name} (Copy)`,
          category: form.category,
          status: 'draft',
          procedure_codes: form.procedureCodes,
          editable_by: form.editableBy,
          hygienist_may_complete: form.hygienistMayComplete,
          is_financial: form.isFinancial,
          source: 'duplicate',
          draft_content: content as never,
          ...factsPatch(content),
          created_by: user.id,
          updated_by: user.id,
        })
        .select('*')
        .single();
      if (error) throw error;
      void logConsentAudit({
        orgId: ctx.org_id,
        action: 'form_duplicated',
        entityType: 'form',
        entityId: data.id,
        entityName: form.name,
        actorId: user.id,
        actorName: user.email ?? '',
      });
      return mapForm(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-forms'] }),
  });
}

/** Copy a past version into the working draft (never auto-published). */
export function useRestoreConsentVersion() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { form: ConsentForm; version: ConsentFormVersion }) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { error } = await consentDb
        .from('consent_forms')
        .update({ draft_content: input.version.content as never, updated_by: user.id })
        .eq('id', input.form.id);
      if (error) throw error;
      void logConsentAudit({
        orgId: ctx.org_id,
        action: 'version_restored',
        entityType: 'form',
        entityId: input.form.id,
        entityName: input.form.name,
        actorId: user.id,
        actorName: user.email ?? '',
        detail: { restoredVersion: input.version.version },
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['consent-forms'] });
      qc.invalidateQueries({ queryKey: ['consent-form', vars.form.id] });
    },
  });
}

/**
 * Install the sample library: 13 published starter templates + 5 bundles,
 * all flagged as samples that must be reviewed before clinical use.
 * Manager-only in the UI; safe to re-run (skips when samples exist).
 */
export function useInstallSampleLibrary() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<number> => {
      if (!ctx || !user) throw new Error('Not signed in');

      const { data: existing, error: existingError } = await consentDb
        .from('consent_forms')
        .select('id')
        .eq('org_id', ctx.org_id)
        .eq('is_sample', true)
        .limit(1);
      if (existingError) throw existingError;
      if ((existing ?? []).length > 0) return 0;

      const idByKey = new Map<string, string>();
      for (const sample of SAMPLE_TEMPLATES) {
        const content = sample.build();
        const { data, error } = await consentDb
          .from('consent_forms')
          .insert({
            org_id: ctx.org_id,
            name: sample.name,
            category: sample.category,
            status: 'published',
            procedure_codes: sample.procedureCodes,
            hygienist_may_complete: sample.hygienistMayComplete ?? false,
            is_financial: sample.isFinancial ?? false,
            is_sample: true,
            source: 'sample',
            current_version: 1,
            published_content: content as never,
            ...factsPatch(content),
            created_by: user.id,
            updated_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        idByKey.set(sample.key, data.id);
        const { error: versionError } = await consentDb.from('consent_form_versions').insert({
          org_id: ctx.org_id,
          form_id: data.id,
          version: 1,
          content: content as never,
          change_notes: SAMPLE_REVIEW_NOTE,
          published_by: user.id,
        });
        if (versionError) throw versionError;
      }

      for (const [i, bundle] of SAMPLE_BUNDLES.entries()) {
        const { data, error } = await consentDb
          .from('consent_bundles')
          .insert({
            org_id: ctx.org_id,
            name: bundle.name,
            description: bundle.description,
            procedure_codes: bundle.procedureCodes,
            sort_order: i,
            is_sample: true,
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        const items = bundle.items
          .map((item, j) => ({
            org_id: ctx.org_id,
            bundle_id: data.id,
            form_id: idByKey.get(item.templateKey),
            requirement: item.requirement,
            condition_label: item.conditionLabel ?? '',
            sort_order: j,
          }))
          .filter((item): item is typeof item & { form_id: string } => !!item.form_id);
        const { error: itemsError } = await consentDb.from('consent_bundle_items').insert(items);
        if (itemsError) throw itemsError;
      }

      void logConsentAudit({
        orgId: ctx.org_id,
        action: 'samples_installed',
        entityType: 'settings',
        actorId: user.id,
        actorName: user.email ?? '',
        detail: { forms: SAMPLE_TEMPLATES.length, bundles: SAMPLE_BUNDLES.length },
      });
      return SAMPLE_TEMPLATES.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consent-forms'] });
      qc.invalidateQueries({ queryKey: ['consent-bundles'] });
    },
  });
}
