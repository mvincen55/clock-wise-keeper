import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePublishedKnowledge, type PublishedKnowledgeEntry } from '@/hooks/usePublishedKnowledge';
import { knowledgeAreaLabel, type KnowledgeArea } from '@/lib/knowledge';
import { cn } from '@/lib/utils';

type Props = {
  area: KnowledgeArea;
  title: string;
  subtitle: string;
  fallback: ReactNode;
};

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
  return new Date(value).toLocaleDateString(undefined, {
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

function KnowledgeBlock({ block }: { block: PublishedKnowledgeEntry['blocks'][number] }) {
  const contentLines = lines(block.plain_text);

  if (block.block_type === 'divider') return <hr className="my-7 border-border" />;
  if (block.block_type === 'heading') {
    return <h2 className="mt-8 scroll-mt-24 text-xl font-semibold tracking-tight first:mt-0">{block.plain_text}</h2>;
  }
  if (block.block_type === 'bullet_list') {
    return (
      <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-7 text-foreground/90">
        {contentLines.map((line, index) => <li key={`${block.id}-${index}`}>{line.replace(/^[-•]\s*/, '')}</li>)}
      </ul>
    );
  }
  if (block.block_type === 'numbered_list' || block.block_type === 'steps') {
    return (
      <ol className="my-4 space-y-3 pl-0 text-[15px] leading-7 text-foreground/90 [counter-reset:step]">
        {contentLines.map((line, index) => (
          <li key={`${block.id}-${index}`} className="flex gap-3 [counter-increment:step]">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary before:content-[counter(step)]" />
            <span>{line.replace(/^\d+[.)]\s*/, '')}</span>
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
            <span>{line.replace(/^[-•☐✓]\s*/, '')}</span>
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
        <AlertDescription className="whitespace-pre-wrap leading-6">{block.plain_text}</AlertDescription>
      </Alert>
    );
  }
  if (block.block_type === 'script') {
    return (
      <div className="my-5 rounded-xl border-l-4 border-primary bg-muted/35 px-5 py-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Suggested wording</p>
        <p className="whitespace-pre-wrap text-[15px] italic leading-7 text-foreground/90">“{block.plain_text}”</p>
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
            <tr>{head.map((cell, index) => <th key={index} className="border-b px-3 py-2.5 font-semibold">{cell}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b last:border-0">
                {head.map((_, cellIndex) => <td key={cellIndex} className="px-3 py-2.5 align-top">{row[cellIndex] ?? ''}</td>)}
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
        <p className="whitespace-pre-wrap leading-6">{block.plain_text}</p>
      </div>
    );
  }

  return <p className="my-4 whitespace-pre-wrap text-[15px] leading-7 text-foreground/90">{block.plain_text}</p>;
}

export default function PublishedKnowledgeReader({ area, title, subtitle, fallback }: Props) {
  const { data, isLoading, error } = usePublishedKnowledge(area);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('');

  const entries = data?.entries ?? [];
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpenCheck className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
            Published office copy
          </Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </header>

      <div className="mb-4 lg:hidden">
        <Select value={activeEntry?.item.id ?? ''} onValueChange={choose}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={`Choose from the ${knowledgeAreaLabel(area)}`} />
          </SelectTrigger>
          <SelectContent>
            {filteredEntries.map(entry => (
              <SelectItem key={entry.item.id} value={entry.item.id}>{entry.version.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search this library…"
              className="pl-9"
            />
          </div>
          <nav className="space-y-5" aria-label={`${title} contents`}>
            {grouped.map(group => (
              <section key={group.category.id}>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.category.name}
                </h2>
                <div className="space-y-1">
                  {group.entries.map(entry => (
                    <button
                      type="button"
                      key={entry.item.id}
                      onClick={() => choose(entry.item.id)}
                      className={cn(
                        'flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        activeEntry?.item.id === entry.item.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      <span>{entry.version.title}</span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {uncategorized.length > 0 && (
              <section>
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other</h2>
                <div className="space-y-1">
                  {uncategorized.map(entry => (
                    <button
                      type="button"
                      key={entry.item.id}
                      onClick={() => choose(entry.item.id)}
                      className={cn(
                        'flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        activeEntry?.item.id === entry.item.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      <span>{entry.version.title}</span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </nav>
        </aside>

        <main className="min-w-0">
          <div className="relative mb-4 lg:hidden">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search this library…"
              className="pl-9"
            />
          </div>

          {!activeEntry ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Search className="mx-auto h-9 w-9 text-muted-foreground/50" />
                <p className="mt-3 font-medium">No published item matches that search</p>
                <Button className="mt-3" variant="outline" onClick={() => setQuery('')}>Clear search</Button>
              </CardContent>
            </Card>
          ) : (
            <article className="rounded-2xl border bg-card shadow-sm">
              <div className="border-b px-5 py-5 md:px-8 md:py-7">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{activeEntry.category?.name ?? 'Office reference'}</span>
                  <span aria-hidden="true">•</span>
                  <span>Version {activeEntry.version.version_number}</span>
                  <span aria-hidden="true">•</span>
                  <span>Published {formatDate(activeEntry.version.published_at)}</span>
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{activeEntry.version.title}</h2>
                {activeEntry.version.summary && (
                  <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
                    {activeEntry.version.summary}
                  </p>
                )}
                {(activeEntry.version.effective_on || activeEntry.version.review_due_on) && (
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {activeEntry.version.effective_on && <Badge variant="secondary">Effective {formatDate(activeEntry.version.effective_on)}</Badge>}
                    {activeEntry.version.review_due_on && <Badge variant="outline">Review by {formatDate(activeEntry.version.review_due_on)}</Badge>}
                  </div>
                )}
              </div>
              <div className="px-5 py-6 md:px-8 md:py-8">
                {activeEntry.blocks.length > 0 ? (
                  activeEntry.blocks.map(block => <KnowledgeBlock key={block.id} block={block} />)
                ) : (
                  <p className="text-sm text-muted-foreground">This published item has no readable content blocks.</p>
                )}
              </div>
            </article>
          )}
        </main>
      </div>
    </div>
  );
}
