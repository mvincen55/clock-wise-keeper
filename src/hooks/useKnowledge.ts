import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json } from '@/integrations/supabase/types';
import {
  knowledgeSupabase,
  type KnowledgeBlockRow,
  type KnowledgeCategoryRow,
  type KnowledgeItemRow,
  type KnowledgeVersionRow,
} from '@/integrations/supabase/knowledge-client';
import type {
  KnowledgeAudienceRole,
  KnowledgeBlockDraft,
  KnowledgeDraftInput,
  KnowledgeStatus,
} from '@/lib/knowledge';
import { knowledgeStatusPriority } from '@/lib/knowledge';
import { useOrgContext } from '@/hooks/useOrgContext';

const workspaceKey = (orgId?: string) => ['knowledge-workspace', orgId] as const;
const blocksKey = (versionId?: string | null) => ['knowledge-blocks', versionId] as const;

export type KnowledgeWorkspaceItem = KnowledgeItemRow & {
  category: KnowledgeCategoryRow | null;
  versions: KnowledgeVersionRow[];
  workingVersion: KnowledgeVersionRow | null;
  publishedVersion: KnowledgeVersionRow | null;
};

export type KnowledgeWorkspaceData = {
  categories: KnowledgeCategoryRow[];
  items: KnowledgeWorkspaceItem[];
  counts: Record<KnowledgeStatus, number>;
};

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function blocksToJson(blocks: KnowledgeBlockDraft[]): Json {
  return blocks.map(block => ({
    block_key: block.block_key,
    block_type: block.block_type,
    plain_text: block.plain_text,
    data: block.data as Json,
  })) as Json;
}

export function useKnowledgeWorkspace() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: workspaceKey(ctx?.org_id),
    enabled: !!ctx?.org_id && (ctx.role === 'owner' || ctx.role === 'manager'),
    staleTime: 30_000,
    queryFn: async (): Promise<KnowledgeWorkspaceData> => {
      if (!ctx?.org_id) throw new Error('No organization selected');

      const [categoryResult, itemResult, versionResult] = await Promise.all([
        knowledgeSupabase
          .from('knowledge_categories')
          .select('*')
          .eq('org_id', ctx.org_id)
          .eq('is_active', true)
          .order('area')
          .order('sort_order')
          .order('name'),
        knowledgeSupabase
          .from('knowledge_items')
          .select('*')
          .eq('org_id', ctx.org_id)
          .is('archived_at', null)
          .order('updated_at', { ascending: false }),
        knowledgeSupabase
          .from('knowledge_versions')
          .select('*')
          .eq('org_id', ctx.org_id)
          .order('version_number', { ascending: false }),
      ]);

      throwIfError(categoryResult.error);
      throwIfError(itemResult.error);
      throwIfError(versionResult.error);

      const categories = categoryResult.data ?? [];
      const categoryById = new Map(categories.map(category => [category.id, category]));
      const versionsByItem = new Map<string, KnowledgeVersionRow[]>();

      for (const version of versionResult.data ?? []) {
        versionsByItem.set(version.item_id, [
          ...(versionsByItem.get(version.item_id) ?? []),
          version,
        ]);
      }

      const items = (itemResult.data ?? []).map(item => {
        const versions = (versionsByItem.get(item.id) ?? []).sort((a, b) => {
          const statusDifference = knowledgeStatusPriority(a.status) - knowledgeStatusPriority(b.status);
          return statusDifference || b.version_number - a.version_number;
        });
        const workingVersion =
          versions.find(version => ['draft', 'in_review', 'approved'].includes(version.status)) ??
          versions.find(version => version.status === 'published') ??
          versions[0] ??
          null;
        const publishedVersion =
          versions.find(version => version.id === item.current_published_version_id) ?? null;
        const metadataVersion = workingVersion ?? publishedVersion;
        const categoryId = metadataVersion?.category_id ?? item.category_id;

        return {
          ...item,
          title: metadataVersion?.title ?? item.title,
          summary: metadataVersion?.summary ?? item.summary,
          category_id: categoryId,
          audience_roles: metadataVersion?.audience_roles ?? item.audience_roles,
          category: categoryId ? categoryById.get(categoryId) ?? null : null,
          versions,
          workingVersion,
          publishedVersion,
        } satisfies KnowledgeWorkspaceItem;
      });

      const counts: Record<KnowledgeStatus, number> = {
        draft: 0,
        in_review: 0,
        approved: 0,
        published: 0,
        superseded: 0,
        retired: 0,
      };
      for (const item of items) {
        if (item.workingVersion) counts[item.workingVersion.status] += 1;
      }

      return { categories, items, counts };
    },
  });
}

export function useKnowledgeBlocks(versionId?: string | null) {
  return useQuery({
    queryKey: blocksKey(versionId),
    enabled: !!versionId,
    queryFn: async (): Promise<KnowledgeBlockRow[]> => {
      if (!versionId) return [];
      const { data, error } = await knowledgeSupabase
        .from('knowledge_blocks')
        .select('*')
        .eq('version_id', versionId)
        .order('sort_order')
        .order('id');
      throwIfError(error);
      return data ?? [];
    },
  });
}

function useKnowledgeInvalidation() {
  const { data: ctx } = useOrgContext();
  const queryClient = useQueryClient();
  return async (versionId?: string | null) => {
    await queryClient.invalidateQueries({ queryKey: workspaceKey(ctx?.org_id) });
    if (versionId) {
      await queryClient.invalidateQueries({ queryKey: blocksKey(versionId) });
    }
  };
}

export function useEnsureKnowledgeCategories() {
  const invalidate = useKnowledgeInvalidation();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await knowledgeSupabase.rpc('ensure_default_knowledge_categories', {});
      throwIfError(error);
      return data ?? [];
    },
    onSuccess: () => invalidate(),
  });
}

export function useCreateKnowledgeDraft() {
  const invalidate = useKnowledgeInvalidation();
  return useMutation({
    mutationFn: async (input: KnowledgeDraftInput) => {
      const { data, error } = await knowledgeSupabase.rpc('create_knowledge_draft', {
        p_kind: input.kind,
        p_title: input.title.trim(),
        p_summary: input.summary.trim(),
        p_category_id: input.categoryId,
        p_audience_roles: input.audienceRoles,
        p_blocks: blocksToJson(input.blocks),
      });
      throwIfError(error);
      if (!data) throw new Error('The draft was not created');
      return data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useSaveKnowledgeDraft() {
  const invalidate = useKnowledgeInvalidation();
  return useMutation({
    mutationFn: async ({ versionId, input }: { versionId: string; input: KnowledgeDraftInput }) => {
      const { data, error } = await knowledgeSupabase.rpc('save_knowledge_draft', {
        p_version_id: versionId,
        p_title: input.title.trim(),
        p_summary: input.summary.trim(),
        p_category_id: input.categoryId,
        p_audience_roles: input.audienceRoles,
        p_change_summary: input.changeSummary.trim(),
        p_blocks: blocksToJson(input.blocks),
      });
      throwIfError(error);
      if (!data) throw new Error('The draft was not saved');
      return data;
    },
    onSuccess: data => invalidate(data.id),
  });
}

export function useCreateKnowledgeRevision() {
  const invalidate = useKnowledgeInvalidation();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await knowledgeSupabase.rpc('create_knowledge_revision', {
        p_item_id: itemId,
      });
      throwIfError(error);
      if (!data) throw new Error('The revision was not created');
      return data;
    },
    onSuccess: versionId => invalidate(versionId),
  });
}

export function useSubmitKnowledgeReview() {
  const invalidate = useKnowledgeInvalidation();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await knowledgeSupabase.rpc(
        'submit_knowledge_version_for_review',
        { p_version_id: versionId },
      );
      throwIfError(error);
      if (!data) throw new Error('The draft was not submitted');
      return data;
    },
    onSuccess: data => invalidate(data.id),
  });
}

export function useReviewKnowledgeVersion() {
  const invalidate = useKnowledgeInvalidation();
  return useMutation({
    mutationFn: async ({
      versionId,
      decision,
      note,
    }: {
      versionId: string;
      decision: 'approved' | 'changes_requested';
      note: string;
    }) => {
      const { data, error } = await knowledgeSupabase.rpc('review_knowledge_version', {
        p_version_id: versionId,
        p_decision: decision,
        p_note: note.trim(),
      });
      throwIfError(error);
      if (!data) throw new Error('The review decision was not saved');
      return data;
    },
    onSuccess: data => invalidate(data.id),
  });
}

export function usePublishKnowledgeVersion() {
  const invalidate = useKnowledgeInvalidation();
  return useMutation({
    mutationFn: async (versionId: string) => {
      const { data, error } = await knowledgeSupabase.rpc('publish_knowledge_version', {
        p_version_id: versionId,
      });
      throwIfError(error);
      if (!data) throw new Error('The version was not published');
      return data;
    },
    onSuccess: data => invalidate(data.id),
  });
}

export function asKnowledgeAudienceRoles(values: string[]): KnowledgeAudienceRole[] {
  return values.filter(
    (value): value is KnowledgeAudienceRole =>
      value === 'owner' || value === 'manager' || value === 'employee',
  );
}
