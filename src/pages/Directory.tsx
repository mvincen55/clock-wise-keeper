import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { formatEmployeeNameLastFirst } from '@/lib/employee-name';
import { formatDate, getToday, shiftDate } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Workplace → Directory (design §3.5): who works here, for everyone. Only
 * what every member may read is shown: names and staff codes, and this
 * week's office closures. Time off is each person's own and stays in
 * Management for managers; nothing here guesses at it.
 */
export default function Directory() {
  const { data: ctx } = useOrgContext();
  const { data: staff, isLoading } = useOrgStaff();
  const { data: closures } = useOfficeClosures();
  const today = getToday();
  const weekEnd = shiftDate(today, 6);
  const people = useMemo(() => (staff ?? [])
    .filter(m => m.employmentStatus === 'active')
    .map(m => ({ ...m, name: formatEmployeeNameLastFirst(m.displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [staff]);
  const thisWeek = (closures ?? []).filter(c => c.closure_date >= today && c.closure_date <= weekEnd);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Directory</h1>
        <p className="text-muted-foreground">{ctx?.org_name ? `${ctx.org_name} · ` : ''}{people.length} {people.length === 1 ? 'person' : 'people'}</p>
      </div>

      <Card className="card-elevated">
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-base">This week</CardTitle></CardHeader>
        <CardContent className="p-4 text-sm">
          {thisWeek.length === 0
            ? <p className="text-muted-foreground">No office closures between {formatDate(today)} and {formatDate(weekEnd)}.</p>
            : <ul className="space-y-1">{thisWeek.map(c => <li key={c.id}>{formatDate(c.closure_date)} · {c.name}{c.is_full_day ? '' : ` · ${c.hours}h`}</li>)}</ul>}
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />People</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : people.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No one is listed yet.</p> : (
            <ul className="divide-y">
              {people.map(p => (
                <li key={p.employeeId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-muted-foreground">{p.code ? `code ${p.code}` : ''}{p.userId ? '' : `${p.code ? ' · ' : ''}no login yet`}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
