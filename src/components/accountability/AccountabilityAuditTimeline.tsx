import { Clock } from 'lucide-react';
import { formatDate, formatTime } from '@/lib/time-utils';
import type { AccountabilityReport } from '@/hooks/useAccountability';

type Entry = { at: string; label: string };

function stamp(iso: string) {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/**
 * Internal audit trail for a record — admins only.
 * Never render this for the subject: it exposes escalation state.
 */
export default function AccountabilityAuditTimeline({ report }: { report: AccountabilityReport }) {
  const entries: Entry[] = [];

  if (report.created_at) entries.push({ at: report.created_at, label: 'System opened the record' });
  if (report.member_signed_at)
    entries.push({
      at: report.member_signed_at,
      label: `Signed by ${report.member_signed_name ?? 'team member'}`,
    });
  if (report.escalated_at)
    entries.push({ at: report.escalated_at, label: 'System moved the review up to the owner' });
  if (report.manager_signed_at)
    entries.push({
      at: report.manager_signed_at,
      label: `Reviewed and signed off by ${report.manager_signed_name ?? 'reviewer'}`,
    });
  if (report.closed_at) entries.push({ at: report.closed_at, label: 'Record closed and filed' });

  entries.sort((a, b) => a.at.localeCompare(b.at));

  const pending =
    report.status !== 'closed' && report.review_due_at
      ? `Sign-off due ${formatDate(report.review_due_at.slice(0, 10))}`
      : null;

  if (entries.length === 0 && !pending) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Internal audit trail
      </div>
      <ol className="space-y-1.5">
        {entries.map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-2 text-xs">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span className="text-muted-foreground">
              <span className="text-foreground">{e.label}</span> — {stamp(e.at)}
            </span>
          </li>
        ))}
        {pending && (
          <li className="flex gap-2 text-xs">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground" />
            <span className="text-muted-foreground">{pending}</span>
          </li>
        )}
      </ol>
    </div>
  );
}
