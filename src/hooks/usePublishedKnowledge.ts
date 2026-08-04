import { useQuery } from '@tanstack/react-query';
import { knowledgeSupabase, type KnowledgeBlockRow, type KnowledgeCategoryRow, type KnowledgeItemRow, type KnowledgeVersionRow } from '@/integrations/supabase/knowledge-client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { KnowledgeArea } from '@/lib/knowledge';

export type PublishedKnowledgeEntry = {
  item: KnowledgeItemRow;
  version: KnowledgeVersionRow;
  category: KnowledgeCategoryRow | null;
  blocks: KnowledgeBlockRow[];
};

export type PublishedKnowledgeLibrary = {
  area: KnowledgeArea;
  categories: KnowledgeCategoryRow[];
  entries: PublishedKnowledgeEntry[];
};

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function usePublishedKnowledge(area: KnowledgeArea) {
  const { data: ctx } = useOrgContext();
  const kind = area === 'handbook' ? 'policy' : 'procedure';

  return useQuery({
    queryKey: ['published-knowledge', ctx?.org_id, area, ctx?.role],
    enabled: !!ctx?.org_id,
    staleTime: 60_000,
    queryFn: async (): Promise<PublishedKnowledgeLibrary> => {
      if (!ctx?.org_id) throw new Error('No organization selected');

      const [categoryResult, itemResult] = await Promise.all([
        knowledgeSupabase
          .from('knowledge_categories')
          .select('*')
          .eq('org_id', ctx.org_id)
          .eq('area', area)
          .eq('is_active', true)
          .order('sort_order')
          .order('name'),
        knowledgeSupabase
          .from('knowledge_items')
          .select('*')
          .eq('org_id', ctx.org_id)
          .eq('kind', kind)
          .is('archived_at', null)
          .not('current_published_version_id', 'is', null)
          .order('title'),
      ]);

      throwIfError(categoryResult.error);
      throwIfError(itemResult.error);

      const categories = categoryResult.data ?? [];
      const items = itemResult.data ?? [];
      const versionIds = items
        .map(item => item.current_published_version_id)
        .filter((id): id is string => !!id);

      if (versionIds.length === 0) return { area, categories, entries: [] };

      const [versionResult, blockResult] = await Promise.all([
        knowledgeSupabase
          .from('knowledge_versions')
          .select('*')
          .in('id', versionIds)
          .eq('status', 'published'),
        knowledgeSupabase
          .from('knowledge_blocks')
          .select('*')
          .in('version_id', versionIds)
          .order('sort_order')
          .order('id'),
      ]);

      throwIfError(versionResult.error);
      throwIfError(blockResult.error);

      const versionById = new Map((versionResult.data ?? []).map(version => [version.id, version]));
      const categoryById = new Map(categories.map(category => [category.id, category]));
      const blocksByVersion = new Map<string, KnowledgeBlockRow[]>();
      for (const block of blockResult.data ?? []) {
        blocksByVersion.set(block.version_id, [
          ...(blocksByVersion.get(block.version_id) ?? []),
          block,
        ]);
      }

      const entries = items.flatMap(item => {
        const versionId = item.current_published_version_id;
        const version = versionId ? versionById.get(versionId) : undefined;
        if (!version || version.item_id !== item.id || version.org_id !== item.org_id) return [];
        return [{
          item,
          version,
          category: version.category_id ? categoryById.get(version.category_id) ?? null : null,
          blocks: blocksByVersion.get(version.id) ?? [],
        } satisfies PublishedKnowledgeEntry];
      });

      entries.sort((left, right) => {
        const categoryOrder = (left.category?.sort_order ?? 999) - (right.category?.sort_order ?? 999);
        return categoryOrder || left.version.title.localeCompare(right.version.title);
      });

      return { area, categories, entries };
    },
  });
}
