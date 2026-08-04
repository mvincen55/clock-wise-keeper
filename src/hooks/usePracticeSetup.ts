import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  practiceSetupSupabase,
  type PracticeSetupFindingRow,
  type PracticeSetupFindingSourceRow,
  type PracticeSetupSessionRow,
  type PracticeSetupSourceRow,
} from '@/integrations/supabase/practice-setup-client';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  knowledgeKindForSetupAction,
  sourceChunksToKnowledgeDraft,
  type PracticeSetupAction,
} from '@/lib/practice-setup';

const setupKey = (orgId?: string) => ['practice-setup', orgId] as const;

export type PracticeSetupData = {
  session: PracticeSetupSessionRow | null;
  sources: PracticeSetupSourceRow[];
  findings: PracticeSetupFindingRow[];
  findingSources: PracticeSetupFindingSourceRow[];
};

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function usePracticeSetup() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: setupKey(ctx?.org_id),
    enabled: !!ctx?.org_id && (ctx.role === 'owner' || ctx.role === 'manager'),
    staleTime: 20_000,
    queryFn: async (): Promise<PracticeSetupData> => {
      if (!ctx?.org_id) throw new Error('No organization selected');

      const sessionResult = await practiceSetupSupabase
        .from('practice_setup_sessions')
        .select('*')
        .eq('org_id', ctx.org_id)
        .maybeSingle();
      throwIfError(sessionResult.error);
      const session = sessionResult.data ?? null;
      if (!session) return { session: null, sources: [], findings: [], findingSources: [] };

      const [sourceResult, findingResult, findingSourceResult] = await Promise.all([
        practiceSetupSupabase
          .from('practice_setup_sources')
          .select('*')
          .eq('session_id', session.id)
          .order('created_at'),
        practiceSetupSupabase
          .from('practice_setup_findings')
          .select('*')
          .eq('session_id', session.id)
          .order('severity', { ascending: false })
          .order('created_at'),
        practiceSetupSupabase
          .from('practice_setup_finding_sources')
          .select('*')
          .eq('org_id', ctx.org_id),
      ]);

      throwIfError(sourceResult.error);
      throwIfError(findingResult.error);
      throwIfError(findingSourceResult.error);

      const findingIds = new Set((findingResult.data ?? []).map(finding => finding.id));
      return {
        session,
        sources: sourceResult.data ?? [],
        findings: findingResult.data ?? [],
        findingSources: (findingSourceResult.data ?? []).filter(link => findingIds.has(link.finding_id)),
      };
    },
  });
}

function useSetupInvalidation() {
  const { data: ctx } = useOrgContext();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: setupKey(ctx?.org_id) }),
      queryClient.invalidateQueries({ queryKey: ['knowledge-workspace', ctx?.org_id] }),
      queryClient.invalidateQueries({ queryKey: ['office-docs', ctx?.org_id] }),
    ]);
  };
}

export function useInitializePracticeSetup() {
  const { data: ctx } = useOrgContext();
  const invalidate = useSetupInvalidation();
  return useMutation({
    mutationFn: async () => {
      if (!ctx?.org_id) throw new Error('No organization selected');
      const { data, error } = await practiceSetupSupabase.rpc('initialize_practice_setup', {
        p_org_id: ctx.org_id,
      });
      throwIfError(error);
      if (!data) throw new Error('Practice Setup did not start');
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useConfirmPracticeSetupSource() {
  const invalidate = useSetupInvalidation();
  return useMutation({
    mutationFn: async (input: {
      sourceId: string;
      action: PracticeSetupAction;
      categoryId: string | null;
    }) => {
      const { data, error } = await practiceSetupSupabase.rpc('confirm_practice_setup_source', {
        p_source_id: input.sourceId,
        p_action: input.action,
        p_category_id: input.categoryId,
      });
      throwIfError(error);
      if (!data) throw new Error('The source classification was not saved');
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useConvertPracticeSetupSource() {
  const invalidate = useSetupInvalidation();
  return useMutation({
    mutationFn: async (input: {
      source: PracticeSetupSourceRow;
      sourceTitle: string;
      sourceCharCount: number;
      title?: string;
      summary?: string;
    }) => {
      if (input.source.confirmed_action !== 'policy' && input.source.confirmed_action !== 'procedure') {
        throw new Error('Confirm this source as a policy or procedure first');
      }
      const kind = knowledgeKindForSetupAction(input.source.confirmed_action);
      if (!kind) throw new Error('This source is not eligible for conversion');

      const { data: chunks, error: chunkError } = await supabase
        .from('office_doc_chunks')
        .select('content, chunk_index')
        .eq('doc_id', input.source.office_doc_id)
        .order('chunk_index');
      if (chunkError) throw chunkError;

      const converted = sourceChunksToKnowledgeDraft({
        sourceTitle: input.sourceTitle,
        chunkContents: (chunks ?? []).map(chunk => chunk.content),
        kind,
        declaredCharCount: input.sourceCharCount,
      });

      const blocks = converted.blocks.map(block => ({
        block_key: block.block_key,
        block_type: block.block_type,
        plain_text: block.plain_text,
        data: block.data as Json,
      })) as Json;

      const { data, error } = await practiceSetupSupabase.rpc('convert_practice_setup_source', {
        p_source_id: input.source.id,
        p_title: input.title?.trim() || converted.title,
        p_summary: input.summary?.trim() || converted.summary,
        p_blocks: blocks,
      });
      throwIfError(error);
      if (!data) throw new Error('The governed draft was not created');
      return { itemId: data, preview: converted };
    },
    onSuccess: invalidate,
  });
}

export function useResolvePracticeSetupFinding() {
  const invalidate = useSetupInvalidation();
  return useMutation({
    mutationFn: async (input: { findingId: string; status: 'resolved' | 'dismissed' }) => {
      const { data, error } = await practiceSetupSupabase.rpc('resolve_practice_setup_finding', {
        p_finding_id: input.findingId,
        p_status: input.status,
      });
      throwIfError(error);
      if (!data) throw new Error('The finding was not updated');
      return data;
    },
    onSuccess: invalidate,
  });
}
