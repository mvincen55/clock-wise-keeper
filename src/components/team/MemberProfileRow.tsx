import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  freeTag,
  suggestTag,
  TAG_PATTERN,
  useSaveBasics,
  useTagRegistry,
  useTeamOnboardingStatus,
} from '@/hooks/useOnboarding';

type Member = {
  id: string;
  user_id: string | null;
  display_name: string;
  preferred_name?: string | null;
  tag?: string | null;
  /** Shared-by-choice fun facts, used for thank-yous and birthdays. */
  favorites?: Record<string, string> | null;
};

const FAVORITE_LABELS: Record<string, string> = {
  food: 'Food',
  pizza: 'Pizza',
  dessert: 'Dessert',
  drink: 'Drink',
  snack: 'Snack',
  treat: 'Treat',
};


/**
 * Manager view of a member's tag and onboarding progress.
 * Progress only — never the answers themselves.
 */
export default function MemberProfileRow({ employee }: { employee: Member }) {
  const { data: registry } = useTagRegistry();
  const { data: team } = useTeamOnboardingStatus();
  const save = useSaveBasics();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(employee.tag ?? '');

  const taken = useMemo(
    () =>
      new Set(
        (registry ?? [])
          .filter(r => r.employee_id !== employee.id)
          .map(r => String(r.tag).toUpperCase()),
      ),
    [registry, employee.id],
  );

  const status = team?.find(t => t.user_id === employee.user_id);
  const valid = TAG_PATTERN.test(draft) && !taken.has(draft.toUpperCase());

  const startEdit = () => {
    setDraft(employee.tag ?? freeTag(suggestTag(employee.display_name), taken));
    setEditing(true);
  };

  const commit = async () => {
    if (!valid) {
      toast.error('Tags are 2–4 letters or numbers, and never reused.');
      return;
    }
    try {
      await save.mutateAsync({ employeeId: employee.id, tag: draft });
      setEditing(false);
      toast.success(`Tag set to ${draft.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the tag');
    }
  };

  const favorites = Object.entries(employee.favorites ?? {}).filter(([, v]) => v);

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
      {editing ? (
        <div className="flex items-center gap-1">
          <Input
            value={draft}
            onChange={e =>
              setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
            }
            className="h-7 w-20 font-mono text-xs tracking-widest"
            aria-label={`Tag for ${employee.display_name}`}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={commit} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <button
          onClick={startEdit}
          className="flex items-center gap-1 rounded border px-2 py-1 font-mono tracking-widest transition-colors hover:bg-muted"
          title="Tag shown on reports and print sheets"
        >
          {employee.tag || 'no tag'}
          <Pencil className="h-3 w-3 opacity-50" />
        </button>
      )}

      {employee.preferred_name && (
        <span className="text-muted-foreground">goes by {employee.preferred_name}</span>
      )}

      {status ? (
        status.complete ? (
          <Badge variant="outline" className="border-success/30 text-success">Onboarded</Badge>
        ) : (
          <Badge variant="outline" className="border-warning/30 text-warning">
            Onboarding{' '}
            {['terms', 'work_style', 'basics', 'goal'].filter(
              k => status.steps[k as keyof typeof status.steps],
            ).length}
            /4
          </Badge>
        )
      ) : (
        <Badge variant="outline" className="text-muted-foreground">Not started</Badge>
      )}
      </div>

      {favorites.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Gift className="h-3 w-3 text-primary" />
          {favorites.map(([key, value]) => (
            <span key={key} className="rounded border px-1.5 py-0.5">
              {FAVORITE_LABELS[key] ?? key}: <span className="text-foreground">{value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );

}
