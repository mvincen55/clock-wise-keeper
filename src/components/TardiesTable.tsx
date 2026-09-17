import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate, formatClock, formatInstantClock } from '@/lib/time-utils';
import type { TardyRow } from '@/hooks/useTardies';

type Props = {
  rows: TardyRow[];
  loading?: boolean;
  /**
   * Whose tardy each row is. Owners and managers read the whole office's
   * rows here, so two people late on the same day must be told apart;
   * omit it for the personal view, where every row is the viewer's own.
   */
  employeeNameFor?: (row: TardyRow) => string;
  /** Approving or editing a tardy is manager-only. */
  canReview: boolean;
  onReview: (row: TardyRow) => void;
};

const statusClass: Record<TardyRow['approval_status'], string> = {
  approved: 'bg-success/20 text-success',
  unapproved: 'bg-destructive/20 text-destructive',
  unreviewed: 'bg-warning/20 text-warning',
};

/** Minutes late across the rows, leaving out punches whose time looks off. */
function totalMinutesLate(rows: readonly TardyRow[]): number {
  return rows.filter(t => !t.timezone_suspect).reduce((s, t) => s + t.minutes_late, 0);
}

export function TardiesTable({ rows, loading = false, employeeNameFor, canReview, onReview }: Props) {
  const showEmployee = !!employeeNameFor;
  const columns = showEmployee ? 8 : 7;

  // Newest day first; on a shared day, the office's rows sit together by name.
  const sorted = useMemo(() => {
    if (!employeeNameFor) return rows;
    return [...rows].sort((a, b) =>
      b.entry_date.localeCompare(a.entry_date) || employeeNameFor(a).localeCompare(employeeNameFor(b)),
    );
  }, [rows, employeeNameFor]);

  return (
    <Card className="card-elevated overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
              {showEmployee && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>}
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expected</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actual</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Minutes Late</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={columns} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : !sorted.length ? (
              <tr><td colSpan={columns} className="py-12 text-center text-muted-foreground">No tardies recorded</td></tr>
            ) : (
              sorted.map(t => (
                <tr key={t.id} className={t.timezone_suspect ? 'bg-warning/5' : ''}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {formatDate(t.entry_date)}
                    {t.timezone_suspect && (
                      <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium" title="This punch time looks off. Edit the punches (managers) or submit a correction request.">⚠ Time Looks Off</span>
                    )}
                  </td>
                  {showEmployee && <td className="px-4 py-3 whitespace-nowrap">{employeeNameFor(t)}</td>}
                  <td className="px-4 py-3 time-display text-sm whitespace-nowrap">{formatClock(t.expected_start_time)}</td>
                  <td className="px-4 py-3 time-display text-sm whitespace-nowrap">
                    {t.timezone_suspect ? (
                      <span className="text-warning italic">—</span>
                    ) : (
                      formatInstantClock(t.actual_start_time)
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold text-destructive">
                    {t.timezone_suspect ? '—' : t.minutes_late}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{t.reason_text || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusClass[t.approval_status] ?? statusClass.unreviewed}`}>
                      {t.approval_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {/* Approving/editing tardies is manager-only; employees
                        add their reason from the Timesheet prompt */}
                    {canReview ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onReview(t)}>
                        {t.approval_status === 'unreviewed' ? 'Review' : 'Edit'}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 font-bold">
                <td colSpan={showEmployee ? 4 : 3} className="px-4 py-3 text-right">Totals:</td>
                <td className="px-4 py-3 text-destructive">{totalMinutesLate(sorted)} min</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}
