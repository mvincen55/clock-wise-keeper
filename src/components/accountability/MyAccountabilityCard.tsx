import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/time-utils';
import {
  useMyAccountabilityReports,
  useSignAccountabilityReport,
  POLICY_LABELS,
  type AccountabilityReport,
} from '@/hooks/useAccountability';
import { useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';

function SignForm({ report }: { report: AccountabilityReport }) {
  const sign = useSignAccountabilityReport();
  const [reason, setReason] = useState('');
  const [name, setName] = useState('');

  const dateline = () => {
    const stamp = formatDate(new Date().toISOString().slice(0, 10));
    setReason(r => (r ? `${r}\n\n${stamp} — ` : `${stamp} — `));
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <Label className="text-xs">What happened, in your words</Label>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={dateline}>
            Dateline
          </Button>
        </div>
        <Textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="School drop-off ran long, traffic on the bridge — whatever it was."
          className="min-h-[90px]"
        />
      </div>
      <div>
        <Label className="text-xs">Type your name to sign</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
      </div>
      <p className="text-xs text-muted-foreground">
        Once you sign, this goes to your manager for review.
      </p>
      <Button
        size="sm"
        disabled={sign.isPending || !name.trim() || reason.trim().length < 3}
        onClick={() => sign.mutate({ reportId: report.id, reason, typedName: name })}
      >
        {sign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign the record
      </Button>
    </div>
  );
}

/** The member's own records: sign the open one, read the closed ones. */
export default function MyAccountabilityCard({ highlightId }: { highlightId?: string | null }) {
  const { data: reports = [], isLoading } = useMyAccountabilityReports();
  // A "record needs your note" notification lands on the exact record.
  const highlightRef = useScrollIntoView<HTMLDivElement>(
    !!highlightId && reports.some(r => r.id === highlightId)
  );

  if (isLoading || reports.length === 0) return null;

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-4 w-4 text-primary" />
          My records
        </CardTitle>
        <p className="pt-1 text-xs text-muted-foreground">
          Record-keeping, not punishment. The record says what happened — you say why.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {reports.map(r => (
          <div
            key={r.id}
            ref={r.id === highlightId ? highlightRef : undefined}
            className={`space-y-3 rounded-md border p-3 ${r.id === highlightId ? DEEP_LINK_HIGHLIGHT : ''}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{POLICY_LABELS[r.kind] ?? r.kind}</span>
              <Badge variant={r.status === 'closed' ? 'secondary' : 'default'}>
                {r.status === 'awaiting_member'
                  ? 'Needs your note'
                  : r.status === 'closed'
                    ? 'On file'
                    : 'With your manager'}
              </Badge>
            </div>
            <p className="text-sm">{r.summary}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(r.period_start)} – {formatDate(r.period_end)}
            </p>

            {r.status === 'awaiting_member' ? (
              <SignForm report={r} />
            ) : (
              <div className="space-y-1 text-xs text-muted-foreground">
                {r.member_reason && <p className="text-foreground">“{r.member_reason}”</p>}
                {r.member_signed_name && (
                  <p>Signed by {r.member_signed_name} on {formatDate(r.member_signed_at!.slice(0, 10))}</p>
                )}
                {r.manager_note && <p className="text-foreground">Manager: {r.manager_note}</p>}
                {r.manager_signed_name && (
                  <p>Reviewed by {r.manager_signed_name} on {formatDate(r.manager_signed_at!.slice(0, 10))}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
