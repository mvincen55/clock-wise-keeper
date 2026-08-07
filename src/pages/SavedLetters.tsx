import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Archive, ArchiveRestore, Copy, Loader2, Pencil, PenLine, Plus, ShieldCheck,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useCorrespondencePermissions } from '@/hooks/useCorrespondenceSettings';
import {
  useDuplicateLetterTemplate,
  useLetterTemplates,
  useSetLetterTemplateStatus,
} from '@/hooks/useLetterTemplates';
import { useStaffCodeMap } from '@/hooks/useStaffCodes';
import { attributionLabel } from '@/lib/staff-code';
import { resolvePlaceholders } from '@/lib/letters/letter-body';
import {
  LETTER_CATEGORIES,
  LETTER_CATEGORY_LABELS,
  type LetterCategory,
  type LetterTemplate,
} from '@/lib/letters/types';

/**
 * Saved Letters — the office's reusable letter library. Every entry is
 * WORDING with {{placeholder}} tokens; recipient/patient values are typed
 * fresh each time a letter is used and never stored (the save path enforces
 * this — see SaveTemplateDialog). Team members can always USE letters;
 * creating/editing/archiving follows the office's permission setting,
 * enforced by RLS as well as here.
 */

function previewOf(template: LetterTemplate): string {
  const flat = resolvePlaceholders(template.body, {}, { missing: 'keep' })
    .replace(/\*\*|_|::(center|right)\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

export default function SavedLetters() {
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: templates, isLoading } = useLetterTemplates();
  const { canManageTemplates, isManager } = useCorrespondencePermissions();
  const setStatus = useSetLetterTemplateStatus();
  const duplicate = useDuplicateLetterTemplate();
  const staffCodes = useStaffCodeMap();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | LetterCategory>('all');
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (templates ?? [])
      .filter(t => (showArchived ? t.status === 'archived' : t.status === 'active'))
      .filter(t => category === 'all' || t.category === category)
      .filter(
        t =>
          term === '' ||
          t.title.toLowerCase().includes(term) ||
          t.body.toLowerCase().includes(term),
      );
  }, [templates, search, category, showArchived]);

  const dateLabel = (iso: string) => new Date(iso).toLocaleDateString();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Saved Letters</h1>
        {canManageTemplates && (
          <Button size="sm" asChild>
            <Link to="/letters/write">
              <Plus className="h-4 w-4 mr-1.5" />
              Write a new letter
            </Link>
          </Button>
        )}
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Reusable office wording only</AlertTitle>
        <AlertDescription>
          Saved letters hold the office's words with placeholders like {'{{patient_name}}'}.
          The details typed while using a letter are merged for printing only and never stored.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search letters…"
          className="max-w-xs"
          aria-label="Search letters"
        />
        <Select value={category} onValueChange={v => setCategory(v as 'all' | LetterCategory)}>
          <SelectTrigger className="w-44" aria-label="Category filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {LETTER_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>
                {LETTER_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isManager && (
          <Button variant="ghost" size="sm" onClick={() => setShowArchived(a => !a)}>
            <Archive className="h-4 w-4 mr-1.5" />
            {showArchived ? 'Back to active letters' : 'Archived letters'}
          </Button>
        )}
      </div>

      {!ctx || isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {showArchived
              ? 'No archived letters.'
              : 'No saved letters yet. Write a letter and save its wording to build the office library — insurance appeals, employer letters, records-transfer covers, and other reusable correspondence.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map(t => (
            <Card key={t.id} className="card-elevated flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{t.title}</CardTitle>
                  <Badge variant="outline">{LETTER_CATEGORY_LABELS[t.category] ?? t.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {attributionLabel('Updated', staffCodes.get(t.updatedBy ?? '') ?? null)} ·{' '}
                  {dateLabel(t.updatedAt)} · v{t.version}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-sm text-muted-foreground line-clamp-3">{previewOf(t)}</p>
                <div className="mt-auto flex flex-wrap gap-1.5">
                  {t.status === 'active' && (
                    <Button size="sm" onClick={() => navigate(`/letters/write?template=${t.id}`)}>
                      <PenLine className="h-3.5 w-3.5 mr-1" />
                      Use
                    </Button>
                  )}
                  {canManageTemplates && t.status === 'active' && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/letters/write?edit=${t.id}`)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={duplicate.isPending}
                        onClick={() =>
                          duplicate.mutate(t, {
                            onSuccess: () => toast({ title: 'Letter duplicated' }),
                          })
                        }
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Duplicate
                      </Button>
                    </>
                  )}
                  {canManageTemplates && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate(
                          { id: t.id, status: t.status === 'active' ? 'archived' : 'active' },
                          {
                            onSuccess: () =>
                              toast({
                                title: t.status === 'active' ? 'Letter archived' : 'Letter restored',
                              }),
                          },
                        )
                      }
                    >
                      {t.status === 'active' ? (
                        <>
                          <Archive className="h-3.5 w-3.5 mr-1" />
                          Archive
                        </>
                      ) : (
                        <>
                          <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
                          Restore
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
