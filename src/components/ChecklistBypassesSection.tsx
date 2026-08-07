import { ClipboardX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOrgBypasses } from '@/hooks/useChecklistBypasses';
import { useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';

/** Read-only manager view of checklist bypasses. Informative, never shaming. */
export default function ChecklistBypassesSection({ orgId, highlightId }: { orgId?: string; highlightId?: string | null }) {
  const { data: rows, isLoading } = useOrgBypasses(orgId);
  // A bypass notification scrolls to and marks the exact row it names.
  const highlightRef = useScrollIntoView<HTMLTableRowElement>(
    rows?.some(r => r.id === highlightId) ? highlightId : false
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardX className="h-4 w-4 text-muted-foreground" />
          Checklist bypasses
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !rows?.length ? (
          <p className="text-sm text-muted-foreground">No checklist bypasses recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Member</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Open items</th>
                  <th className="py-2 pr-3 font-medium">Level</th>
                  <th className="py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.id}
                    ref={r.id === highlightId ? highlightRef : undefined}
                    className={`border-b last:border-0 align-top ${r.id === highlightId ? 'bg-primary/10' : ''}`}
                  >
                    <td className="py-2 pr-3 font-medium">{r.display_name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{r.checklist_date}</td>
                    <td className="py-2 pr-3">{r.incomplete_count}</td>
                    <td className="py-2 pr-3">
                      {r.escalation_level > 1 ? (
                        <Badge variant="destructive">#{r.escalation_level}</Badge>
                      ) : (
                        <Badge variant="secondary">#1</Badge>
                      )}
                    </td>
                    <td className="py-2 max-w-md">
                      {r.reason ? (
                        <span className="whitespace-pre-wrap">{r.reason}</span>
                      ) : (
                        <span className="text-muted-foreground">Awaiting reason</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
