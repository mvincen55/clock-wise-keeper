/**
 * SourceKnowledgeReader — the policies or procedures an office already has
 * inside its uploaded documents, readable section by section until governed
 * versions are published. Same two-pane shape as the published reader, so the
 * page does not change character on the day the first procedure is published.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BlockView } from '@/components/library/DocBlockView';
import { highlighted } from '@/components/library/highlight';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useSourceKnowledge } from '@/hooks/useSourceKnowledge';
import { resolveDocPlacement, sectionAnchorId, snippetAround } from '@/lib/doc-library';
import { groupSectionsByPart, sectionReadingLink, type SourceSection, type SourceSectionKind } from '@/lib/source-knowledge';

type Props = {
  kind: SourceSectionKind;
  title: string;
  subtitle: string;
  /** Shown when the uploaded documents hold nothing of this kind. */
  empty: ReactNode;
};

const NOUN: Record<SourceSectionKind, { one: string; many: string }> = {
  policy: { one: 'policy', many: 'policies' },
  procedure: { one: 'procedure', many: 'procedures' },
  reference: { one: 'reference', many: 'references' },
};

export default function SourceKnowledgeReader({ kind, title, subtitle, empty }: Props) {
  const { docs, sections: all, isLoading, error } = useSourceKnowledge();
  const { data: ctx } = useOrgContext();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(params.get('section') ?? '');
  const [contentsOpen, setContentsOpen] = useState(false);

  const sections = useMemo(() => all.filter(section => section.kind === kind), [all, kind]);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(
    () => sections.filter(section => !normalizedQuery || section.searchText.includes(normalizedQuery)),
    [sections, normalizedQuery]
  );

  useEffect(() => {
    const requested = params.get('section');
    if (requested && sections.some(section => section.id === requested)) setActiveId(requested);
  }, [params, sections]);

  useEffect(() => {
    if (filtered.length === 0) return;
    if (!filtered.some(section => section.id === activeId)) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  if (isLoading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }
  if (sections.length === 0) {
    return (
      <>
        {error && <p role="alert" className="mx-auto max-w-4xl px-4 pt-4 text-sm text-destructive md:px-8">The office documents could not be loaded. Refresh to try again.</p>}
        {empty}
      </>
    );
  }

  const noun = NOUN[kind];
  const active = filtered.find(section => section.id === activeId) ?? filtered[0] ?? null;
  const activeDoc = active ? docs.find(doc => doc.id === active.docId) : undefined;
  const readingLink = active && activeDoc ? sectionReadingLink(active, resolveDocPlacement(activeDoc).libraryArea) : null;
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const choose = (id: string) => {
    setActiveId(id);
    setContentsOpen(false);
    requestAnimationFrame(() => {
      const heading = document.getElementById('policy-title');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const sectionButton = (section: SourceSection) => {
    const match = normalizedQuery && section.searchText.includes(normalizedQuery)
      ? section.blocks.map(block => ('text' in block ? block.text : 'items' in block ? block.items.join(' ') : '')).find(text => text.toLowerCase().includes(normalizedQuery))
      : undefined;
    return (
      <button key={section.id} type="button" onClick={() => choose(section.id)} aria-current={active?.id === section.id ? 'page' : undefined} className="policy-toc-link">
        <span>{highlighted(section.title, query)}</span>
        {match && <small>{highlighted(snippetAround(match, query, 110), query)}</small>}
      </button>
    );
  };

  return (
    <div className="published-reader source-reader mx-auto max-w-7xl p-4 md:p-8">
      <header className="mb-2">
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </header>
      <div className="policy-layout">
        <aside className="policy-sidebar">
          <div className="policy-search">
            <label htmlFor="source-search" className="handbook-eyebrow">Search {noun.many}</label>
            <div className="relative mt-2">
              <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="source-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Find a ${noun.one} or step…`} className="pl-9 pr-14" />
              {query && <button type="button" className="policy-search-clear" onClick={() => setQuery('')}>Clear</button>}
            </div>
            <p className="policy-search-count" role="status">
              {normalizedQuery ? `${filtered.length} matching ${filtered.length === 1 ? 'result' : 'results'}` : `${sections.length} ${sections.length === 1 ? noun.one : noun.many} from your office documents`}
            </p>
          </div>
          {!normalizedQuery && (
            <button type="button" className="policy-mobile-toggle" aria-expanded={contentsOpen} aria-controls="source-contents" onClick={() => setContentsOpen(!contentsOpen)}>
              {contentsOpen ? 'Hide contents' : 'Browse contents'} <span aria-hidden="true">{contentsOpen ? '−' : '+'}</span>
            </button>
          )}
          <nav id="source-contents" className={`policy-contents ${contentsOpen || normalizedQuery ? 'is-open' : ''}`} aria-label={`${title} contents`}>
            {groupSectionsByPart(filtered).map((group, index) => (
              <section key={`${group.part ?? 'top'}-${index}`}>
                {group.part && <h2 className="handbook-eyebrow">{group.part}</h2>}
                {group.sections.map(sectionButton)}
              </section>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">
          {!active ? (
            <div className="policy-empty">
              <h2>No {noun.many} match “{query}”</h2>
              <p>Try a shorter phrase, or browse all the contents.</p>
              <Button className="mt-4" variant="outline" onClick={() => setQuery('')}>Clear search</Button>
            </div>
          ) : (
            <article className="policy-article">
              <header className="policy-article-header">
                <p className="handbook-eyebrow">{active.part ?? active.docTitle}</p>
                <h2 id="policy-title" tabIndex={-1}>{highlighted(active.title, query)}</h2>
                <div className="policy-metadata">
                  <span>From {active.docTitle}</span>
                  {readingLink && <Link to={readingLink} className="source-reader-link">Read in the handbook <span aria-hidden="true">→</span></Link>}
                </div>
              </header>
              <div className="policy-body source-reader-body">
                {active.blocks.map((block, index) => (
                  <BlockView key={active.blockIndex + 1 + index} block={block} id={sectionAnchorId(active.blockIndex + 1 + index)} query={query} />
                ))}
                {active.blocks.length === 0 && <p className="text-sm text-muted-foreground">This section has no text of its own.</p>}
              </div>
              {isManager && (
                <p className="source-reader-note">
                  This is your uploaded document as written. To make a reviewed, versioned copy official, publish it in <Link to="/management/knowledge">Manage Policies &amp; Procedures</Link>.
                </p>
              )}
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
