import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import {
  useAddFofCodeRule,
  useFofCodeRules,
  useRemoveFofCodeRule,
  type FofCodeRuleKind,
} from '@/hooks/useFofRules';

const KIND_META: { kind: FofCodeRuleKind; title: string; description: string }[] = [
  {
    kind: 'never_covered',
    title: 'Never covered by insurance',
    description: 'These codes always land in "No Coverage" regardless of their CDT range.',
  },
  {
    kind: 'no_prepay',
    title: 'Billed at the visit (no prepay)',
    description: 'Fees collected at their visit, never in the half-ahead prepay schedule.',
  },
  {
    kind: 'membership_included',
    title: 'Included with membership',
    description: 'Procedures the in-house membership covers at no charge on membership forms.',
  },
];

function KindEditor({ kind, title, description, codes }: {
  kind: FofCodeRuleKind;
  title: string;
  description: string;
  codes: ReadonlySet<string>;
}) {
  const add = useAddFofCodeRule();
  const remove = useRemoveFofCodeRule();
  const [draft, setDraft] = useState('');

  const submit = () => {
    if (draft.trim() === '') return;
    add.mutate(
      { kind, code: draft },
      {
        onSuccess: () => setDraft(''),
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div>
        <div className="font-medium text-sm">{title}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[...codes].sort().map(code => (
          <Badge key={code} variant="secondary" className="gap-1">
            {code}
            <button
              type="button"
              aria-label={`Remove ${code}`}
              onClick={() =>
                remove.mutate({ kind, code }, { onError: err => toast.error(err.message) })
              }
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {codes.size === 0 && <span className="text-xs text-muted-foreground">No codes.</span>}
      </div>
      <div className="flex gap-2 items-center">
        <Label htmlFor={`code-add-${kind}`} className="sr-only">Add code</Label>
        <Input
          id={`code-add-${kind}`}
          className="w-28"
          placeholder="D4265"
          value={draft}
          onChange={e => setDraft(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <Button variant="outline" size="sm" disabled={add.isPending} onClick={submit}>
          {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Manager editor for the org's code lists (Phase 2b). These change
 * coverage and scheduling behavior; codes are validated as CDT (D####)
 * here and by the database CHECK constraint.
 */
export default function FofCodeRulesCard() {
  const { data: codeRules, isLoading } = useFofCodeRules();

  if (isLoading || !codeRules) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const setFor = (kind: FofCodeRuleKind): ReadonlySet<string> =>
    kind === 'never_covered'
      ? codeRules.neverCovered
      : kind === 'no_prepay'
        ? codeRules.noPrepay
        : codeRules.membershipIncluded;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Coverage Code Rules (Managers)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {KIND_META.map(meta => (
          <KindEditor key={meta.kind} {...meta} codes={setFor(meta.kind)} />
        ))}
      </CardContent>
    </Card>
  );
}
