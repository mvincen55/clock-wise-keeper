import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, RefreshCw } from 'lucide-react';
import ManagementShell from '@/components/management/ManagementShell';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { useReadiness } from '@/hooks/useReadiness';
import { Button } from '@/components/ui/button';
import { lastCompletedPayPeriod, type PayPeriod } from '@/lib/attention';
import { daysBetween, formatDate, getToday, shiftDate } from '@/lib/time-utils';

/**
 * Management → Payroll (design §7.6): the benchmark rhythm. State → the
 * exceptions → the exact fix → the canonical editor → return → resolved.
 * Every count on the page reads one derived state; export is never blocked.
 */
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function PayrollReadiness() {
  const [params, setParams] = useSearchParams();
  const { data: settings } = usePayrollSettings();
  const today = getToday();
  const base: PayPeriod = useMemo(() => lastCompletedPayPeriod(today, {
    pay_period_type: settings?.pay_period_type ?? 'weekly',
    week_start_day: settings?.week_start_day ?? 1,
    payroll_due_days_after_period: settings?.payroll_due_days_after_period ?? null,
    pay_period_anchor: settings?.pay_period_anchor ?? null,
  }), [today, settings]);
  const start = isDate(params.get('start')) ? params.get('start')! : base.start;
  const end = isDate(params.get('end')) && params.get('end')! >= start ? params.get('end')! : isDate(params.get('start')) ? shiftDate(start, daysBetween(base.start, base.end)) : base.end;
  const period = useMemo(() => ({ start, end }), [start, end]);
  const length = daysBetween(start, end) + 1;
  const { result, enabled, refetch } = useReadiness(period);
  const isBase = start === base.start && end === base.end;
  const dueDate = isBase ? base.dueDate : null;
  const returnTo = encodeURIComponent(`/management/payroll?start=${start}&end=${end}`);
  const go = (s: string, e: string) => setParams({ start: s, end: e }, { replace: true });
  const withReturn = (href: string) => `${href}${href.includes('?') ? '&' : '?'}return=${returnTo}`;

  const status = result?.status;
  const heading = !result
    ? 'Reading the period…'
    : status === 'ready' ? 'Ready'
      : status === 'not_ready' ? `Not ready yet · ${result.issues.length} record${result.issues.length === 1 ? '' : 's'}`
        : 'Can’t confirm yet';

  return (
    <ManagementShell room="payroll">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Payroll readiness</h1>
            <p className="text-sm text-muted-foreground">Is the pay period clean, and what do I fix first?</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Pay period">
            <Button variant="outline" size="icon" aria-label="Previous period" onClick={() => go(shiftDate(start, -length), shiftDate(start, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[14rem] text-center text-sm font-medium">
              {formatDate(start)} – {formatDate(end)}
              <span className="block text-xs font-normal text-muted-foreground">
                {isBase ? 'last completed period' : `${length} days`}{base.assumed && isBase ? ' · assumed: set a period start in Office settings' : ''}
                {dueDate ? ` · payroll due ${formatDate(dueDate)}` : isBase && !settings?.payroll_due_days_after_period ? ' · no due date set' : ''}
              </span>
            </span>
            <Button variant="outline" size="icon" aria-label="Next period" disabled={end >= today} onClick={() => go(shiftDate(end, 1), shiftDate(end, length))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>

        <section aria-live="polite" className={`rounded-lg border p-4 ${status === 'ready' ? 'border-success/40 bg-success/5' : status === 'not_ready' ? 'border-warning/40 bg-warning/5' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!result ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : status === 'ready' ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className={`h-5 w-5 ${status === 'not_ready' ? 'text-warning' : 'text-muted-foreground'}`} />}
              <h2 className="text-lg font-semibold">{heading}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {status === 'unknown' && <Button variant="outline" size="sm" onClick={refetch}><RefreshCw className="mr-1.5 h-4 w-4" />Retry</Button>}
              <Button asChild size="sm" variant={status === 'ready' ? 'default' : 'outline'}>
                <Link to={`/reports?type=pay_period&start=${start}&end=${end}`}>
                  <FileText className="mr-1.5 h-4 w-4" />Prepare payroll report{result && result.issues.length ? ` · ${result.issues.length} open record${result.issues.length === 1 ? '' : 's'}` : ''}
                </Link>
              </Button>
            </div>
          </div>
          {status === 'unknown' && result && (
            <p className="mt-2 text-sm text-muted-foreground">
              {result.degraded.map(d => `${d.name}: ${d.status.state}${d.status.asOf ? ` (as of ${formatDate(d.status.asOf)})` : ''}`).join(' · ')}. A source that cannot be read never reads as ready. The report can still be prepared; unresolved issues print on it.
            </p>
          )}
          {status === 'ready' && <p className="mt-2 text-sm text-muted-foreground">Every scheduled day in the period has time on record or an explanation, and nothing is pending inside it.</p>}
          {!enabled && <p className="mt-2 text-sm text-muted-foreground">Payroll readiness is for owners and managers.</p>}
        </section>

        {result && result.issues.length > 0 && (
          <section aria-label="Records to fix" className="space-y-2">
            <p className="text-sm text-muted-foreground">Person · date · what is wrong · the exact fix. Fixing opens the record's own editor and returns here.</p>
            <ul className="divide-y rounded-lg border">
              {result.issues.map(issue => (
                <li key={issue.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{issue.name}</span>
                    {issue.date && <span className="text-muted-foreground"> · {formatDate(issue.date)}</span>}
                    <span> · {issue.label}</span>
                    {issue.waiting && (
                      <span className="block text-xs text-muted-foreground">
                        {issue.waiting.workState === 'waiting_on_employee' ? `waiting on ${issue.name.split(/[ ,]/)[0]}` : issue.waiting.workState === 'needs_action' ? 'parked' : issue.waiting.workState.replace(/_/g, ' ')}
                        {issue.waiting.dueAt ? ` · follow up ${formatDate(issue.waiting.dueAt)}` : ''} · still unresolved for payroll
                      </span>
                    )}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link to={issue.href.startsWith('/management?') ? issue.href : withReturn(issue.href)}>
                      {issue.kind === 'correction_pending' || issue.kind === 'pto_pending' ? 'Review' : issue.kind === 'missing_day' ? 'Record what happened' : 'Fix the day'}
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result && result.worthALook.length > 0 && (
          <section aria-label="Worth a look" className="space-y-2">
            <h2 className="text-sm font-semibold">Worth a look <span className="font-normal text-muted-foreground">· never blocks</span></h2>
            <ul className="divide-y rounded-lg border">
              {result.worthALook.map(w => (
                <li key={w.key} className="px-3 py-2 text-sm">
                  <span className="font-medium">{w.name}</span> · {w.label}
                  <span className="block text-xs text-muted-foreground">{w.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {result && (
          <dl className="grid gap-3 sm:grid-cols-5">
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">People</dt><dd className="text-sm font-medium">{result.summary.people}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Shifts recorded</dt><dd className="text-sm font-medium">{result.summary.shifts}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Hours recorded</dt><dd className="text-sm font-medium">{(result.summary.minutesRecorded / 60).toFixed(1)}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Approved time off</dt><dd className="text-sm font-medium">{result.summary.approvedPtoDays} {result.summary.approvedPtoDays === 1 ? 'entry' : 'entries'}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Closures</dt><dd className="text-sm font-medium">{result.summary.closures}</dd></div>
          </dl>
        )}

        <p className="text-xs text-muted-foreground">
          Report history and exports live in <Link to="/reports" className="underline">Reports</Link> and <Link to="/report-history" className="underline">Report history</Link>.
        </p>
      </div>
    </ManagementShell>
  );
}
