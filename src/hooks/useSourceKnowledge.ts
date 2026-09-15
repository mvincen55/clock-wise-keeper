import { useMemo } from 'react';
import { useLibraryContents } from '@/hooks/useLibraryContents';
import { useOfficeDocs } from '@/hooks/useOfficeDocs';
import { readerDocsFor, resolveDocPlacement, type LibraryScope, type OfficeDoc } from '@/lib/doc-library';
import { sourceSections, type SourceSection, type SourceSectionKind } from '@/lib/source-knowledge';

/** Documents whose sections can stand in for unpublished policies and procedures. */
export const SOURCE_KNOWLEDGE_SCOPE: LibraryScope = {
  areas: ['workplace', 'playbook', 'shared'],
  collections: ['handbook', 'hr', 'operations', 'training'],
};

function defaultKindFor(doc: OfficeDoc): SourceSectionKind {
  const { collection } = resolveDocPlacement(doc);
  return collection === 'operations' || collection === 'training' ? 'procedure' : 'policy';
}

/**
 * The policies and procedures an office already has inside its uploaded
 * handbook and procedure documents, split into readable sections. Read-only:
 * publishing a governed version still goes through Manage Policies & Procedures.
 */
export function useSourceKnowledge(): {
  docs: OfficeDoc[];
  sections: SourceSection[];
  isLoading: boolean;
  error: Error | null;
} {
  const { data: allDocs, isLoading: docsLoading, error: docsError } = useOfficeDocs();
  const docs = useMemo(() => readerDocsFor(allDocs ?? [], SOURCE_KNOWLEDGE_SCOPE), [allDocs]);
  const { blocksByDoc, isLoading, error } = useLibraryContents(docs);
  const sections = useMemo(
    () =>
      docs.flatMap(doc =>
        sourceSections({ id: doc.id, title: doc.title, defaultKind: defaultKindFor(doc) }, blocksByDoc.get(doc.id) ?? [])
      ),
    [docs, blocksByDoc]
  );
  return { docs, sections, isLoading: docsLoading || (docs.length > 0 && isLoading), error: docsError ?? error ?? null };
}
