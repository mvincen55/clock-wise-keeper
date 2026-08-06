import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useStaffCodesNeedingAttention,
  useReservedStaffCodes,
  type OrgStaffMember,
} from '@/hooks/useStaffCodes';
import { useSaveBasics } from '@/hooks/useOnboarding';
import {
  suggestStaffCode,
  validateStaffCodeInput,
  normalizeStaffCode,
  isLegacyStaffCode,
} from '@/lib/staff-code';

/**
 * Manager-only attention list for the canonical staff code. Active members who
 * have no code (or a legacy 2-character code) are surfaced here with a
 * suggested 3-4 char code that a manager must confirm or edit before it saves.
 *
 * A staff code is office-assigned, so the system never persists a generated
 * code on its own — this is the human-in-the-loop replacement for that.
 */
function AttentionRow({ member, reserved }: { member: OrgStaffMember; reserved: ReadonlySet<string> }) {
  const save = useSaveBasics();
  const [draft, setDraft] = useState(() =>
    suggestStaffCode(member.displayName, new Set([...reserved, ...(member.code ? [member.code] : [])])),
  );

  const normalized = normalizeStaffCode(draft);
  const formatCheck = validateStaffCodeInput(draft);
  // Allow keeping the member's own current code; reject codes used by others.
  const duplicate = reserved.has(normalized) && normalized !== member.code;
  const valid = formatCheck.ok && !duplicate;

  const assign = async () => {
    if (!valid) {
      toast.error(duplicate ? 'That staff code is already used in this office — pick another.' : (formatCheck.reason ?? 'Use 3–4 uppercase letters or numbers.'));
      return;
    }
    try {
      await save.mutateAsync({ employeeId: member.employeeId, tag: normalized });
      toast.success(`Staff code set to ${normalized} for ${member.displayName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the staff code');
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{member.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {member.code
            ? isLegacyStaffCode(member.code)
              ? `Legacy code ${member.code} — replace with a 3–4 character code`
              : `Current: ${member.code}`
            : 'No staff code assigned yet'}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
          className="h-8 w-24 font-mono tracking-widest"
          aria-label={`Staff code for ${member.displayName}`}
        />
        <Button size="sm" onClick={assign} disabled={save.isPending || !valid}>
          {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
          Assign
        </Button>
      </div>
    </div>
  );
}

export default function StaffCodeAttentionCard() {
  const needsAttention = useStaffCodesNeedingAttention();
  const reserved = useReservedStaffCodes();
  const rows = useMemo(() => needsAttention, [needsAttention]);

  if (rows.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-warning" />
          Staff codes need attention
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          These active team members need a 3–4 character staff code so their actions are attributed on
          Forms, reports, and version history. Confirm or edit each suggested code, then Assign.
        </p>
        {rows.map((member) => (
          <AttentionRow key={member.employeeId} member={member} reserved={reserved} />
        ))}
      </CardContent>
    </Card>
  );
}
