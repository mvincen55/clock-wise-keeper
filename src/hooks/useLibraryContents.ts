import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OfficeDoc } from '@/lib/doc-library';
import { stitchChunks } from '@/lib/doc-library';
import { parseDocBlocks, type DocBlock } from '@/lib/doc-format';

/**
 * One fetch of every chunk of the given documents, stitched back into whole
 * texts and parsed into blocks. Feeds the readers, their outlines, search
 * result placement, and the handbook-derived policy/procedure catalog.
 *
 * Re-parsed documents keep multiple parse versions side by side and type
 * their furniture (headers/footers/TOC rows) — only the current version's
 * actual content is read.
 */
export function useLibraryContents(docs: OfficeDoc[]) {
  const docIds = useMemo(() => docs.map(d => d.id), [docs]);
  const versionByDoc = useMemo(
    () => new Map(docs.map(d => [d.id, d.current_parse_version ?? 1])),
    [docs]
  );
  const query = useQuery({
    queryKey: ['library-doc-contents', docIds.join(','), [...versionByDoc.values()].join(',')],
    enabled: docIds.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase
        .from('office_doc_chunks')
        .select('doc_id, chunk_index, content, chunk_type, parse_version')
        .in('doc_id', docIds)
        .not('chunk_type', 'in', '("header","footer","table_of_contents")')
        .order('doc_id')
        .order('chunk_index');
      if (error) throw error;
      const parts = new Map<string, string[]>();
      for (const chunk of data ?? []) {
        if (chunk.parse_version !== (versionByDoc.get(chunk.doc_id) ?? 1)) continue;
        parts.set(chunk.doc_id, [...(parts.get(chunk.doc_id) ?? []), chunk.content]);
      }
      // Stitch, don't join: chunks overlap by design for retrieval, and a
      // naive join repeats every overlap in the reading pane.
      return new Map([...parts.entries()].map(([id, list]) => [id, stitchChunks(list)]));
    },
  });

  const blocksByDoc = useMemo(() => {
    const map = new Map<string, DocBlock[]>();
    if (!query.data) return map;
    for (const id of docIds) map.set(id, parseDocBlocks(query.data.get(id) ?? ''));
    return map;
  }, [query.data, docIds]);

  return { contents: query.data, blocksByDoc, docIds, isLoading: query.isLoading, error: query.error };
}
