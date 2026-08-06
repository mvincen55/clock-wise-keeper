import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, Gift, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  freeTag,
  suggestTag,
  useSaveBasics,
  useTeamOnboardingStatus,
} from '@/hooks/useOnboarding';
import { useReservedStaffCodes } from '@/hooks/useStaffCodes';
import OperationalRolesEditor from '@/components/team/OperationalRolesEditor';
import { validateStaffCodeInput, isLegacyStaffCode, normalizeStaffCode } from '@/lib/staff-code';

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
  const { data: team } = useTeamOnboardingStatus();
  const save = useSaveBasics();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(employee.tag ?? '');

  // Shared reserved set: current tags + the permanent registry, excluding this
  // member's own code so they can keep it.
  const taken = useReservedStaffCodes(employee.id);

  const status = team?.find(t => t.user_id === employee.user_id);
  const formatCheck = validateStaffCodeInput(draft);
  const duplicate = taken.has(normalizeStaffCode(draft));
  const valid = formatCheck.ok && !duplicate;
  const isLegacy = isLegacyStaffCode(employee.tag);

  const startEdit = () => {
    // Editing a legacy 2-char code must replace it with a valid 3-4 code, so
    // seed the draft with a fresh suggestion rather than the legacy value.
    const seed = employee.tag && !isLegacyStaffCode(employee.tag) ? employee.tag : '';
    setDraft(seed || freeTag(suggestTag(employee.display_name), taken));
    setEditing(true);
  };

  const commit = async () => {
    if (duplicate) {
      toast.error('That staff code is already used in this office — pick another.');
      return;
    }
    if (!formatCheck.ok) {
      toast.error(formatCheck.reason ?? 'Staff codes are 3–4 uppercase letters or numbers.');
      return;
    }
    try {
      await save.mutateAsync({ employeeId: employee.id, tag: draft });
      setEditing(false);
      toast.success(`Staff code set to ${normalizeStaffCode(draft)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the staff code');
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
          title="Staff code shown on reports, print sheets, and audit trails"
        >
          {employee.tag || 'no code'}
          <Pencil className="h-3 w-3 opacity-50" />
        </button>
      )}

      {!editing && isLegacy && (
        <Badge variant="destructive" className="text-[10px]">Legacy 2-char — update to 3–4</Badge>
      )}
      {!editing && !employee.tag && employee.user_id && (
        <Badge variant="outline" className="border-warning/40 text-warning text-[10px]">Needs a code</Badge>
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

      <OperationalRolesEditor employeeId={employee.id} />

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
