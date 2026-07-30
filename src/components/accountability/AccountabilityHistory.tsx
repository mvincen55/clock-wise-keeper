import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollText } from 'lucide-react';
import { formatDate } from '@/lib/time-utils';
import { useOrgEmployees } from '@/hooks/useEmployees';
import {
  useOrgAccountabilityReports,
  useEmployeeAccountabilityReports,
  POLICY_LABELS,
  type AccountabilityReport,
} from '@/hooks/useAccountability';

function RecordRow({ r, who }: { r: AccountabilityReport; who?: string }) {
  return (
    <div className="space-y-1 border-b p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {who ? `${who} · ` : ''}
          {POLICY_LABELS[r.kind] ?? r.kind}
        </span>
        <Badge variant="secondary">
          Closed {r.closed_at ? formatDate(r.closed_at.slice(0, 10)) : ''}
        </Badge>
      </div>
      <p className="text-sm">{r.summary}</p>
      {r.member_reason && (
        <p className="text-sm text-muted-foreground">
          “{r.member_reason}” — signed {r.member_signed_name}
          {r.member_signed_at ? ` on ${formatDate(r.member_signed_at.slice(0, 10))}` : ''}
        </p>
      )}
      {r.manager_note && (
        <p className="text-sm text-muted-foreground">
          Review: {r.manager_note} — signed {r.manager_signed_name}
          {r.manager_signed_at ? ` on ${formatDate(r.manager_signed_at.slice(0, 10))}` : ''}
        </p>
      )}
    </div>
  );
}

/** Permanent record — closed accountability records, org-wide or per employee. */
export default function AccountabilityHistory({ employeeId }: { employeeId?: string }) {
  const orgQuery = useOrgAccountabilityReports(!employeeId);
  const empQuery = useEmployeeAccountabilityReports(employeeId);
  const { data: employees } = useOrgEmployees();

  const nameByUser = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => {
      if (e.user_id) m.set(e.user_id, e.preferred_name || e.display_name);
    });
    return m;
  }, [employees]);

  const source = employeeId ? empQuery.data : orgQuery.data ?? [];
  const closed = (source ?? []).filter(r => r.status === 'closed');

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Accountability record
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {closed.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nothing on file. Records land here once they're signed and closed.
          </p>
        ) : (
          closed.map(r => (
            <RecordRow
              key={r.id}
              r={r}
              who={employeeId ? undefined : nameByUser.get(r.subject_user_id ?? '')}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
