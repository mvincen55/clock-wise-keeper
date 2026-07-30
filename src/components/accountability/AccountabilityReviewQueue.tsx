import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/time-utils';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import {
  useOrgAccountabilityReports,
  useCountersignAccountabilityReport,
  POLICY_LABELS,
  type AccountabilityReport,
} from '@/hooks/useAccountability';

function ReviewForm({ report }: { report: AccountabilityReport }) {
  const sign = useCountersignAccountabilityReport();
  const [note, setNote] = useState('');
  const [name, setName] = useState('');

  const dateline = () => {
    const stamp = formatDate(new Date().toISOString().slice(0, 10));
    setNote(n => (n ? `${n}\n\n${stamp} — ` : `${stamp} — `));
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">Document the conversation</Label>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={dateline}>
            Dateline
          </Button>
        </div>
        <Textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="What was discussed and what happens next."
          className="min-h-[80px]"
        />
      </div>
      <div>
        <Label className="text-xs">Type your name to sign off</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
      </div>
      <Button
        size="sm"
        disabled={sign.isPending || !name.trim() || note.trim().length < 3}
        onClick={() => sign.mutate({ reportId: report.id, note, typedName: name })}
      >
        {sign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign off and close
      </Button>
    </div>
  );
}

/** Owner/manager review queue. Only rendered for admins. */
export default function AccountabilityReviewQueue() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  const { data: reports = [] } = useOrgAccountabilityReports(isAdmin);
  const { data: employees } = useOrgEmployees();

  const nameByUser = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => {
      if (e.user_id) m.set(e.user_id, e.preferred_name || e.display_name);
    });
    return m;
  }, [employees]);

  const open = reports.filter(
    r =>
      (r.status === 'awaiting_manager' || r.status === 'awaiting_owner') &&
      r.subject_user_id !== user?.id,
  );

  if (!isAdmin || open.length === 0) return null;

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Records waiting on a sign-off
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {open.map(r => (
          <div key={r.id} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {nameByUser.get(r.subject_user_id ?? '') ?? 'Team member'} ·{' '}
                {POLICY_LABELS[r.kind] ?? r.kind}
              </span>
              {r.status === 'awaiting_owner' ? (
                <Badge variant="destructive">Moved up — owner</Badge>
              ) : r.review_due_at ? (
                <Badge variant="secondary">
                  Due {formatDate(r.review_due_at.slice(0, 10))}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm">{r.summary}</p>
            {r.member_reason && (
              <p className="text-sm text-muted-foreground">
                “{r.member_reason}” — {r.member_signed_name}
              </p>
            )}
            <ReviewForm report={r} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
