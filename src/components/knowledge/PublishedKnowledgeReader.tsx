import HandbookHeader from '@/components/handbook/HandbookHeader';
import { escapeRegExp, snippetAround } from '@/lib/doc-library';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePublishedKnowledge, type PublishedKnowledgeEntry } from '@/hooks/usePublishedKnowledge';
import { type KnowledgeArea } from '@/lib/knowledge';

type Props = {
  area: KnowledgeArea;
  title: string;
  subtitle: string;
  fallback: ReactNode;
};

const EMPTY_ENTRIES: PublishedKnowledgeEntry[] = [];

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function tableRows(text: string): string[][] {
  return lines(text).map(line =>
    line
      .split('|')
      .map(cell => cell.trim())
      .filter((cell, index, cells) => cell || (index > 0 && index < cells.length - 1)),
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'Not listed';
  return new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function searchText(entry: PublishedKnowledgeEntry): string {
  return [
    entry.version.title,
    entry.version.summary,
    entry.category?.name ?? '',
    ...entry.blocks.map(block => block.plain_text),
  ]
    .join(' ')
    .toLowerCase();
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  return text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'ig')).map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? <mark key={index}>{part}</mark> : part,
  );
}

function KnowledgeBlock({ block, query = '' }: { block: PublishedKnowledgeEntry['blocks'][number]; query?: string }) {
  const contentLines = lines(block.plain_text);

  if (block.block_type === 'divider') return <hr className="my-7 border-border" />;
  if (block.block_type === 'heading') {
    return <h3 id={`policy-section-${block.id}`} tabIndex={-1} className="mt-8 scroll-mt-24 text-xl font-semibold tracking-tight first:mt-0">{highlight(block.plain_text, query)}</h3>;
  }
  if (block.block_type === 'bullet_list') {
    return (
      <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-foreground/90">
        {contentLines.map((line, index) => <li key={`${block.id}-${index}`}>{highlight(line.replace(/^[-•]\s*/, ''), query)}</li>)}
      </ul>
    );
  }
  if (block.block_type === 'numbered_list' || block.block_type === 'steps') {
    return (
      <ol className="my-4 space-y-3 pl-0 text-[15px] leading-7 text-foreground/90 [counter-reset:step]">
        {contentLines.map((line, index) => (
          <li key={`${block.id}-${index}`} className="flex gap-3 [counter-increment:step]">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary before:content-[counter(step)]" />
            <span>{highlight(line.replace(/^\d+[.)]\s*/, ''), query)}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (block.block_type === 'checklist') {
    return (
      <div className="my-4 space-y-2">
        {contentLines.map((line, index) => (
          <div key={`${block.id}-${index}`} className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2.5 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>{highlight(line.replace(/^[-•☐✓]\s*/, ''), query)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (block.block_type === 'callout') {
    return (
      <Alert className="my-5 border-primary/25 bg-primary/5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription className="whitespace-pre-wrap leading-6">{highlight(block.plain_text, query)}</AlertDescription>
      </Alert>
    );
  }
  if (block.block_type === 'script') {
    return (
      <div className="my-5 rounded-xl border-l-4 border-primary bg-muted/35 px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Suggested wording</p>
        <p className="whitespace-pre-wrap text-[15px] italic leading-7 text-foreground/90">“{highlight(block.plain_text, query)}”</p>
      </div>
    );
  }
  if (block.block_type === 'table') {
    const rows = tableRows(block.plain_text);
    const [head, ...body] = rows;
    if (!head) return null;
    return (
      <div className="my-5 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <thead className="bg-muted/60">
            <tr>{head.map((cell, index) => <th key={index} className="border-b px-3 py-2.5 font-semibold">{highlight(cell, query)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-0">
                {head.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2.5 align-top">{highlight(row[cellIndex] ?? '', query)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.block_type === 'image') {
    return (
      <div className="my-5 flex items-start gap-3 rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        <FileText className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="whitespace-pre-wrap leading-6">{highlight(block.plain_text, query)}</p>
      </div>
    );
  }

  return <p className="my-4 whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">{highlight(block.plain_text, query)}</p>;
}

export default function PublishedKnowledgeReader({ area, title, subtitle, fallback }: Props) {
  const { data, isLoading, error } = usePublishedKnowledge(area);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('');
  const [contentsOpen, setContentsOpen] = useState(false);

  const entries = data?.entries ?? EMPTY_ENTRIES;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = useMemo(
    () => entries.filter(entry => !normalizedQuery || searchText(entry).includes(normalizedQuery)),
    [entries, normalizedQuery],
  );

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setActiveId('');
      return;
    }
    if (!filteredEntries.some(entry => entry.item.id === activeId)) {
      setActiveId(filteredEntries[0].item.id);
    }
  }, [filteredEntries, activeId]);

  if (isLoading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  // The old document reader remains available until an office has deliberately
  // published its first governed item. A schema error also fails safely back to
  // the existing experience instead of breaking the employee handbook.
  if (error || entries.length === 0) return <>{fallback}</>;

  const activeEntry =
    filteredEntries.find(entry => entry.item.id === activeId) ?? filteredEntries[0] ?? null;
  const grouped = data?.categories
    .map(category => ({
      category,
      entries: filteredEntries.filter(entry => entry.category?.id === category.id),
    }))
    .filter(group => group.entries.length > 0) ?? [];
  const uncategorized = filteredEntries.filter(entry => !entry.category);

  const choose = (entryId: string) => {
    setActiveId(entryId);
    setContentsOpen(false);
    requestAnimationFrame(() => {
      const heading = document.getElementById('policy-title');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };
  const entryLink = (entry: PublishedKnowledgeEntry) => {
    const match = [entry.version.summary, ...entry.blocks.map(block => block.plain_text)]
      .find(text => text?.toLowerCase().includes(normalizedQuery));
    return (
      <button key={entry.item.id} type="button" onClick={() => choose(entry.item.id)}
        aria-current={activeEntry?.item.id === entry.item.id ? 'page' : undefined}
        className="policy-toc-link">
        <span>{highlight(entry.version.title, query)}</span>
        {normalizedQuery && match && <small>{highlight(snippetAround(match, query, 130), query)}</small>}
      </button>
    );
  };

  return (
    <div className={`${area === 'handbook' ? 'handbook' : ''} published-reader mx-auto max-w-7xl p-4 md:p-8`}>
      {area === 'handbook' ? <HandbookHeader title={title} subtitle={subtitle} /> : (
        <header className="mb-6"><h1 className="text-3xl font-bold">{title}</h1><p>{subtitle}</p></header>
      )}
      <div className="policy-layout">
        <aside className="policy-sidebar handbook-toc">
          <div className="policy-search">
            <label htmlFor="policy-search" className="handbook-eyebrow">Search {area === 'handbook' ? 'the handbook' : 'procedures'}</label>
            <div className="relative mt-2">
              <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="policy-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a policy or phrase…" className="pl-9 pr-14" />
              {query && <button type="button" className="policy-search-clear" onClick={() => setQuery('')}>Clear</button>}
            </div>
            <p className="policy-search-count" role="status">{normalizedQuery ? `${filteredEntries.length} matching ${filteredEntries.length === 1 ? 'result' : 'results'}` : `${entries.length} ${area === 'handbook' ? 'policies' : 'procedures'}`}</p>
          </div>
          {!normalizedQuery && <button type="button" className="policy-mobile-toggle" aria-expanded={contentsOpen} aria-controls="policy-contents" onClick={() => setContentsOpen(!contentsOpen)}>
            {contentsOpen ? 'Hide contents' : 'Browse contents'} <span aria-hidden="true">{contentsOpen ? '−' : '+'}</span>
          </button>}
          <nav id="policy-contents" className={`policy-contents ${contentsOpen || normalizedQuery ? 'is-open' : ''}`} aria-label={`${title} contents`}>
            {grouped.map(group => (
              <section key={group.category.id}>
                <h2 className="handbook-eyebrow">{group.category.name}</h2>
                {group.entries.map(entryLink)}
              </section>
            ))}
            {/* No invented category: policies without one are listed directly. */}
            {uncategorized.map(entryLink)}
          </nav>
        </aside>
        <main className="min-w-0">
          {!activeEntry ? (
            <div className="policy-empty">
              <h2>No {area === 'handbook' ? 'policies' : 'procedures'} match “{query}”</h2>
              <p>Try a shorter phrase, or browse all the contents.</p>
              <Button className="mt-4" variant="outline" onClick={() => setQuery('')}>Clear search</Button>
            </div>
          ) : (
            <article className="policy-article handbook-article">
              <header className="policy-article-header">
                <p className="handbook-eyebrow">{activeEntry.category?.name || (area === 'handbook' ? 'Employee Handbook' : 'Office Procedures')}</p>
                <h2 id="policy-title" tabIndex={-1}>{highlight(activeEntry.version.title, query)}</h2>
                {activeEntry.version.summary && <p className="policy-summary">{highlight(activeEntry.version.summary, query)}</p>}
                <div className="policy-metadata">
                  <span>Version {activeEntry.version.version_number}</span>
                  <span>Published {formatDate(activeEntry.version.published_at)}</span>
                  {activeEntry.version.effective_on && <span>Effective {formatDate(activeEntry.version.effective_on)}</span>}
                  {activeEntry.version.review_due_on && <span>Review by {formatDate(activeEntry.version.review_due_on)}</span>}
                </div>
              </header>
              {activeEntry.blocks.some(block => block.block_type === 'heading') && (
                <nav className="policy-on-page" aria-label="In this policy">
                  <span className="handbook-eyebrow">In this {area === 'handbook' ? 'policy' : 'procedure'}</span>
                  {activeEntry.blocks.filter(block => block.block_type === 'heading').map(block => (
                    <a key={block.id} href={`#policy-section-${block.id}`}>{block.plain_text}</a>
                  ))}
                </nav>
              )}
              <div className="policy-body">
                {activeEntry.blocks.length > 0 ? activeEntry.blocks.map(block => <KnowledgeBlock key={block.id} block={block} query={query} />) : (
                  <p>The text of this policy is not available. Ask your manager for a copy.</p>
                )}
              </div>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
