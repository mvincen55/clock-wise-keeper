import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarPlus, ChevronDown, ChevronRight, Clock, Users } from 'lucide-react';
import WorkedHourAdjustments from '@/components/team/WorkedHourAdjustments';
import { RecordTimeOffDialog } from '@/components/pto/RecordTimeOffDialog';
import { UsePtoDialog } from '@/components/pto/UsePtoDialog';
import { useTeamPtoBalances, type TeamPtoBalance } from '@/hooks/usePtoEngine';
import { formatDate } from '@/lib/time-utils';
import { staffCodeLabel } from '@/lib/staff-code';

/**
 * Every team member's PTO bank on one screen, for owners and managers: the
 * live balance today, what is already booked ahead, what can still be
 * given, this week's accrual and use — and the two things a manager does
 * about it: record time off (PTO, sick, a callout) against the bank, or
 * offset worked hours. The numbers are the same live ledger each person
 * sees on their own PTO page.
 */

const hoursText = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2)}h`);

function BalanceCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs text-muted-foreground">No starting balance</span>;
  return <span className={`font-semibold ${value < 0 ? 'text-destructive' : ''}`}>{hoursText(value)}</span>;
}

export default function TeamPtoBalances() {
  const { data, isLoading, error } = useTeamPtoBalances();
  const [recordFor, setRecordFor] = useState<TeamPtoBalance | null>(null);
  const [useFor, setUseFor] = useState<TeamPtoBalance | null>(null);
  const [offsetFor, setOffsetFor] = useState<string | null>(null);
  const rows = useMemo(() => [...(data ?? [])].sort((a, b) => a.sortName.localeCompare(b.sortName)), [data]);
  const withBalance = rows.filter(r => r.balance != null);
  const teamTotal = withBalance.reduce((sum, r) => sum + (r.balance ?? 0), 0);

  return (
    <Card className="card-elevated">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team PTO balances
          </CardTitle>
          {withBalance.length > 0 && (
            <span className="text-sm text-muted-foreground">
              Team total <span className="font-semibold text-foreground">{hoursText(teamTotal)}</span> across {withBalance.length} bank{withBalance.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Live balances as of today. <strong>Available</strong> is the balance minus PTO use already recorded for days ahead — the most that can still be recorded. Nobody's bank goes below zero unless their record allows it. The bank deducts recorded PTO use (Use PTO, or the hours typed on a time-off record), never a day off by itself.
        </p>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {error ? (
          <p role="alert" className="p-6 text-sm text-destructive">Team balances could not be read.</p>
        ) : isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Reading every bank…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No team member accrues PTO yet.</p>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Team member</th>
                <th className="px-3 py-2 text-left font-medium">Tenure</th>
                <th className="px-3 py-2 text-right font-medium">Balance today</th>
                <th className="px-3 py-2 text-right font-medium">Booked ahead</th>
                <th className="px-3 py-2 text-right font-medium">Available</th>
                <th className="px-3 py-2 text-right font-medium">This week</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => {
                const offsetOpen = offsetFor === r.employeeId;
                return (
                  <FragmentRow key={r.employeeId}>
                    <tr className="hover:bg-muted/30 align-top">
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {r.sortName}
                          {r.code && <span className="ml-2 font-mono text-[10px] tracking-widest text-muted-foreground">{staffCodeLabel(r.code)}</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {r.allowNegative && (
                            <Badge variant="outline" className="text-[10px] text-warning border-warning/40" title={r.policyOverride ? 'An exception on this person\'s record allows a negative balance' : 'The office policy allows a negative balance'}>
                              May go negative
                            </Badge>
                          )}
                          {!r.userId && <Badge variant="outline" className="text-[10px] text-muted-foreground">No login</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.tenureDate ? <>{formatDate(r.tenureDate)}<br />{r.tier?.label}</> : 'No start date'}
                      </td>
                      <td className="px-3 py-2 text-right"><BalanceCell value={r.balance} /></td>
                      <td className="px-3 py-2 text-right">{r.bookedAhead > 0 ? hoursText(r.bookedAhead) : '—'}</td>
                      <td className="px-3 py-2 text-right"><BalanceCell value={r.available} /></td>
                      <td className="px-3 py-2 text-right text-xs">
                        {r.currentWeek ? (
                          <>
                            <span className="text-success">+{r.currentWeek.accrual_credited.toFixed(2)}</span>
                            {r.currentWeek.pto_taken_hours > 0 && <span className="ml-1 text-destructive">−{r.currentWeek.pto_taken_hours.toFixed(2)}</span>}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUseFor(r)}>
                            <Clock className="mr-1 h-3 w-3" /> Use PTO
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setRecordFor(r)}>
                            <CalendarPlus className="mr-1 h-3 w-3" /> Record time off
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOffsetFor(offsetOpen ? null : r.employeeId)} aria-expanded={offsetOpen}>
                            {offsetOpen ? <ChevronDown className="mr-1 h-3 w-3" /> : <ChevronRight className="mr-1 h-3 w-3" />} Offset hours
                          </Button>
                        </div>
                        {r.balance == null && (
                          <Link to="/team" className="mt-1 block text-[11px] underline text-muted-foreground">Set the starting balance on Team</Link>
                        )}
                      </td>
                    </tr>
                    {offsetOpen && (
                      <tr className="bg-muted/20">
                        <td colSpan={7} className="px-3 py-3">
                          <WorkedHourAdjustments employeeId={r.employeeId} />
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
      {recordFor && (
        <RecordTimeOffDialog
          open={!!recordFor}
          onClose={() => setRecordFor(null)}
          member={{
            employeeId: recordFor.employeeId,
            userId: recordFor.userId,
            displayName: recordFor.sortName,
            available: recordFor.available,
            allowNegative: recordFor.allowNegative,
          }}
        />
      )}
      {useFor && (
        <UsePtoDialog open={!!useFor} onClose={() => setUseFor(null)} members={[{ employeeId: useFor.employeeId, displayName: useFor.sortName }]} />
      )}
    </Card>
  );
}

/** A keyed pair of table rows (React fragments cannot carry the key in a map without this). */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
