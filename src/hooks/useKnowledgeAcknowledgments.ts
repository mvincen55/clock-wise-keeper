import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import {
  acknowledgmentSupabase,
  type KnowledgeAcknowledgmentRow,
  type KnowledgeAcknowledgmentSettingsRow,
} from '@/integrations/supabase/knowledge-acknowledgment-client';
import {
  knowledgeSupabase,
  type KnowledgeBlockRow,
  type KnowledgeItemRow,
  type KnowledgeVersionRow,
} from '@/integrations/supabase/knowledge-client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { KnowledgeDraftInput } from '@/lib/knowledge';

const acknowledgmentKey = (orgId?: string, userId?: string) =>
  ['knowledge-acknowledgments', orgId, userId] as const;
const rosterKey = (orgId?: string) => ['knowledge-acknowledgment-roster', orgId] as const;
const documentKey = (versionId?: string | null) =>
  ['knowledge-acknowledgment-document', versionId] as const;
const settingsKey = (versionId?: string | null) =>
  ['knowledge-acknowledgment-settings', versionId] as const;

export type KnowledgeAcknowledgmentDocument = {
  item: KnowledgeItemRow;
  version: KnowledgeVersionRow;
  blocks: KnowledgeBlockRow[];
};

export type KnowledgeAcknowledgmentRosterRow = KnowledgeAcknowledgmentRow & {
  displayName: string;
};

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function blocksToJson(input: KnowledgeDraftInput): Json {
  return input.blocks.map(block => ({
    block_key: block.block_key,
    block_type: block.block_type,
    plain_text: block.plain_text,
    data: block.data as Json,
  })) as Json;
}

export function useKnowledgeAcknowledgmentSettings(versionId?: string | null) {
  return useQuery({
    queryKey: settingsKey(versionId),
    enabled: !!versionId,
    queryFn: async (): Promise<KnowledgeAcknowledgmentSettingsRow | null> => {
      if (!versionId) return null;
      const { data, error } = await acknowledgmentSupabase
        .from('knowledge_versions')
        .select('id, org_id, acknowledgment_required, acknowledgment_due_days, acknowledgment_statement')
        .eq('id', versionId)
        .maybeSingle();
      throwIfError(error);
      return data ?? null;
    },
  });
}

export function useMyKnowledgeAcknowledgments() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: acknowledgmentKey(ctx?.org_id, user?.id),
    enabled: !!ctx?.org_id && !!user,
    staleTime: 20_000,
    queryFn: async (): Promise<KnowledgeAcknowledgmentRow[]> => {
      if (!ctx?.org_id || !user) return [];
      const { data, error } = await acknowledgmentSupabase
        .from('knowledge_acknowledgments')
        .select('*')
        .eq('org_id', ctx.org_id)
        .eq('user_id', user.id)
        .order('due_at');
      throwIfError(error);
      return data ?? [];
    },
  });
}

export function useKnowledgeAcknowledgmentRoster() {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: rosterKey(ctx?.org_id),
    enabled: !!ctx?.org_id && isAdmin,
    staleTime: 20_000,
    queryFn: async (): Promise<KnowledgeAcknowledgmentRosterRow[]> => {
      if (!ctx?.org_id || !isAdmin) return [];

      const [assignmentResult, employeeResult] = await Promise.all([
        acknowledgmentSupabase
          .from('knowledge_acknowledgments')
          .select('*')
          .eq('org_id', ctx.org_id)
          .order('due_at'),
        supabase
          .from('employees')
          .select('id, display_name')
          .eq('org_id', ctx.org_id),
      ]);

      throwIfError(assignmentResult.error);
      throwIfError(employeeResult.error);

      const displayNameByEmployee = new Map(
        (employeeResult.data ?? []).map(employee => [employee.id, employee.display_name]),
      );

      return (assignmentResult.data ?? []).map(assignment => ({
        ...assignment,
        displayName:
          (assignment.employee_id
            ? displayNameByEmployee.get(assignment.employee_id)
            : undefined)
          ?? `${assignment.role_at_assignment === 'employee' ? 'Team member' : assignment.role_at_assignment[0].toUpperCase() + assignment.role_at_assignment.slice(1)} ${assignment.user_id.slice(0, 6)}`,
      }));
    },
  });
}

export function useKnowledgeAcknowledgmentDocument(versionId?: string | null) {
  return useQuery({
    queryKey: documentKey(versionId),
    enabled: !!versionId,
    queryFn: async (): Promise<KnowledgeAcknowledgmentDocument | null> => {
      if (!versionId) return null;

      const versionResult = await knowledgeSupabase
        .from('knowledge_versions')
        .select('*')
        .eq('id', versionId)
        .maybeSingle();
      throwIfError(versionResult.error);
      if (!versionResult.data) return null;

      const [itemResult, blockResult] = await Promise.all([
        knowledgeSupabase
          .from('knowledge_items')
          .select('*')
          .eq('id', versionResult.data.item_id)
          .maybeSingle(),
        knowledgeSupabase
          .from('knowledge_blocks')
          .select('*')
          .eq('version_id', versionId)
          .order('sort_order')
          .order('id'),
      ]);

      throwIfError(itemResult.error);
      throwIfError(blockResult.error);
      if (!itemResult.data) return null;

      return {
        item: itemResult.data,
        version: versionResult.data,
        blocks: blockResult.data ?? [],
      };
    },
  });
}

function useAcknowledgmentInvalidation() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const queryClient = useQueryClient();
  return async (versionId?: string | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['knowledge-workspace', ctx?.org_id] }),
      queryClient.invalidateQueries({ queryKey: acknowledgmentKey(ctx?.org_id, user?.id) }),
      queryClient.invalidateQueries({ queryKey: rosterKey(ctx?.org_id) }),
      versionId
        ? Promise.all([
            queryClient.invalidateQueries({ queryKey: settingsKey(versionId) }),
            queryClient.invalidateQueries({ queryKey: documentKey(versionId) }),
          ])
        : Promise.resolve(),
    ]);
  };
}

export function useCreateKnowledgeDraftWithAcknowledgment() {
  const { data: ctx } = useOrgContext();
  const invalidate = useAcknowledgmentInvalidation();

  return useMutation({
    mutationFn: async (input: KnowledgeDraftInput) => {
      if (!ctx?.org_id) throw new Error('No organization selected');
      const { data, error } = await acknowledgmentSupabase.rpc(
        'create_knowledge_draft_with_acknowledgment',
        {
          p_org_id: ctx.org_id,
          p_kind: input.kind,
          p_title: input.title.trim(),
          p_summary: input.summary.trim(),
          p_category_id: input.categoryId,
          p_audience_roles: input.audienceRoles,
          p_blocks: blocksToJson(input),
          p_acknowledgment_required: input.acknowledgmentRequired,
          p_acknowledgment_due_days: input.acknowledgmentRequired
            ? input.acknowledgmentDueDays
            : null,
          p_acknowledgment_statement: input.acknowledgmentRequired
            ? input.acknowledgmentStatement.trim()
            : null,
        },
      );
      throwIfError(error);
      if (!data) throw new Error('The draft was not created');
      return data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useSaveKnowledgeDraftWithAcknowledgment() {
  const invalidate = useAcknowledgmentInvalidation();

  return useMutation({
    mutationFn: async ({ versionId, input }: { versionId: string; input: KnowledgeDraftInput }) => {
      const { data, error } = await acknowledgmentSupabase.rpc(
        'save_knowledge_draft_with_acknowledgment',
        {
          p_version_id: versionId,
          p_title: input.title.trim(),
          p_summary: input.summary.trim(),
          p_category_id: input.categoryId,
          p_audience_roles: input.audienceRoles,
          p_change_summary: input.changeSummary.trim(),
          p_blocks: blocksToJson(input),
          p_acknowledgment_required: input.acknowledgmentRequired,
          p_acknowledgment_due_days: input.acknowledgmentRequired
            ? input.acknowledgmentDueDays
            : null,
          p_acknowledgment_statement: input.acknowledgmentRequired
            ? input.acknowledgmentStatement.trim()
            : null,
        },
      );
      throwIfError(error);
      if (!data) throw new Error('The draft was not saved');
      return data;
    },
    onSuccess: data => invalidate(data.id),
  });
}

export function useMarkKnowledgeAcknowledgmentViewed() {
  const invalidate = useAcknowledgmentInvalidation();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data, error } = await acknowledgmentSupabase.rpc(
        'mark_knowledge_acknowledgment_viewed',
        { p_assignment_id: assignmentId },
      );
      throwIfError(error);
      if (!data) throw new Error('Could not record that this version was viewed');
      return data;
    },
    onSuccess: data => invalidate(data.version_id),
  });
}

export function useAcknowledgeKnowledgeVersion() {
  const invalidate = useAcknowledgmentInvalidation();
  return useMutation({
    mutationFn: async ({ assignmentId, typedName }: { assignmentId: string; typedName: string }) => {
      const { data, error } = await acknowledgmentSupabase.rpc('acknowledge_knowledge_version', {
        p_assignment_id: assignmentId,
        p_typed_name: typedName.trim(),
      });
      throwIfError(error);
      if (!data) throw new Error('The acknowledgment was not saved');
      return data;
    },
    onSuccess: data => invalidate(data.version_id),
  });
}
