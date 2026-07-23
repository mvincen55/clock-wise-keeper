/**
 * Policy Manual — a readable browser over the office knowledge base.
 * Same documents that power Ask AI (one source of truth): upload once in
 * the Assistant's Documents tab, browse it here, ask questions about it
 * there. Internal business documents only — never patient records.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, BookOpen, FileText, Loader2, Search, Sparkles } from 'lucide-react';
import {
  DOC_CATEGORY_LABELS,
  useOfficeDocContent,
  useOfficeDocs,
  type OfficeDoc,
  type OfficeDocCategory,
} from '@/hooks/useOfficeDocs';

const CATEGORY_ORDER: OfficeDocCategory[] = ['policy', 'hr', 'insurance', 'other'];

function DocReader({ doc, onBack }: { doc: OfficeDoc; onBack: () => void }) {
  const { data: content, isLoading } = useOfficeDocContent(doc.id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle className="text-base flex-1 min-w-48">{doc.title}</CardTitle>
          <Badge variant="secondary">
            {DOC_CATEGORY_LABELS[(doc.category as OfficeDocCategory) ?? 'other'] ?? doc.category}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[65vh] pr-4">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {content || 'This document has no readable text.'}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default function PolicyManual() {
  const { data: docs, isLoading } = useOfficeDocs();
  const [query, setQuery] = useState('');
  const [openDoc, setOpenDoc] = useState<OfficeDoc | null>(null);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = (docs ?? []).filter(d => !q || d.title.toLowerCase().includes(q));
    return CATEGORY_ORDER.map(category => ({
      category,
      docs: visible.filter(d => d.category === category),
    })).filter(g => g.docs.length > 0);
  }, [docs, query]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Policy Manual
          </h1>
          <p className="text-muted-foreground text-sm">
            Office policies, HR documents, and insurance references — the same library Ask AI
            answers from.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/assistant">
            <Sparkles className="h-4 w-4 mr-2" />
            Ask AI about these
          </Link>
        </Button>
      </div>

      {openDoc ? (
        <DocReader doc={openDoc} onBack={() => setOpenDoc(null)} />
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search documents…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : grouped.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {query
                  ? 'No documents match that search.'
                  : 'No documents yet. A manager can upload the policy manual and other office documents in the Ask AI → Documents tab.'}
              </CardContent>
            </Card>
          ) : (
            grouped.map(group => (
              <div key={group.category} className="space-y-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {DOC_CATEGORY_LABELS[group.category]}
                </h2>
                {group.docs.map(doc => (
                  <Card
                    key={doc.id}
                    className="cursor-pointer transition-colors hover:bg-accent/50"
                    onClick={() => setOpenDoc(doc)}
                  >
                    <CardContent className="py-3 flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 font-medium text-sm">{doc.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
