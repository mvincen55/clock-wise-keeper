import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, CalendarX2, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useProviders } from '@/hooks/useProviders';
import { useDeleteMissedAppointmentEvent, useMissedAppointmentEvents } from '@/hooks/useMissedAppointmentEvents';
import { MissedAppointmentImportDialog } from '@/components/missed-appointments/MissedAppointmentImportDialog';
import {
  MISSED_APPOINTMENT_CODE_LABELS,
  MISSED_APPOINTMENT_DEPARTMENT_LABELS,
  defaultMissedAppointmentRange,
  filterMissedAppointments,
  summarizeMissedAppointments,
  type MissedAppointmentEvent,
} from '@/lib/missed-appointments';
import { formatDate, getToday } from '@/lib/time-utils';

const LIST_PREVIEW = 60;

/**
 * Management → Missed appointments: the office's Dentrix 9100 (no-show) and
 * 9101 (late cancellation) postings, by month, by department, and by
 * provider, with every posting listed; "Import from Dentrix" records a
 * pasted export. Owners and managers only. Nothing here names a patient.
 */
export default function MissedAppointments() {
  const { data: ctx, isLoading } = useOrgContext();
  const today = getToday();
  const [range, setRange] = useState(() => defaultMissedAppointmentRange(today));
  const [importOpen, setImportOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MissedAppointmentEvent | null>(null);
  const { data: events, isLoading: eventsLoading } = useMissedAppointmentEvents();
  const { data: providers } = useProviders();
  const deleteEvent = useDeleteMissedAppointmentEvent();

  const inRange = useMemo(() => filterMissedAppointments(events ?? [], range.start, range.end), [events, range]);
  const summary = useMemo(() => summarizeMissedAppointments(inRange), [inRange]);
  const listed = showAll ? inRange : inRange.slice(0, LIST_PREVIEW);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  if (ctx && !isManager) return <Navigate to="/" replace />;

  const quickRange = (start: string, end: string) => { setRange({ start, end }); setShowAll(false); };
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteEvent.mutateAsync(pendingDelete.id);
      toast.success('Posting removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The posting could not be removed');
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <header className="space-y-3">
        <Link to="/management" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Management
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <CalendarX2 className="h-6 w-6 text-primary" /> Missed appointments
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              No-shows (9100) and late cancellations (9101) as posted in Dentrix. Import the Appt_Date / Appt_Provider
              export or a day sheet; only the date, the code, and the provider are kept.
            </p>
          </div>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Import from Dentrix
          </Button>
        </div>
      </header>

      <Card className="card-elevated">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="missed-start" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Start</Label>
            <Input id="missed-start" type="date" value={range.start} onChange={e => quickRange(e.target.value, range.end)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="missed-end" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">End</Label>
            <Input id="missed-end" type="date" value={range.end} onChange={e => quickRange(range.start, e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => { const r = defaultMissedAppointmentRange(today); quickRange(r.start, r.end); }}>Last 12 months</Button>
            <Button variant="outline" size="sm" onClick={() => quickRange(yearStart, today)}>This year</Button>
            <Button variant="outline" size="sm" onClick={() => quickRange('', '')}>All time</Button>
          </div>
        </CardContent>
      </Card>

      {eventsLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : inRange.length === 0 ? (
        <Card className="card-elevated">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {events?.length ? 'No postings in this range.' : 'Nothing recorded yet. Import the Dentrix export to start.'}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Postings" value={summary.totals.total} detail={`on ${summary.totals.days} day${summary.totals.days === 1 ? '' : 's'}`} />
            <Stat label="No-shows (9100)" value={summary.totals.noShows} />
            <Stat label="Late cancellations (9101)" value={summary.totals.lateCancels} />
            <Stat
              label="By department"
              value={`${summary.totals.doctor} / ${summary.totals.hygiene}`}
              detail={`doctor / hygiene${summary.totals.other ? ` · ${summary.totals.other} other` : ''}`}
            />
          </div>

          <Card className="card-elevated">
            <CardHeader className="pb-2"><CardTitle className="text-base">By month</CardTitle></CardHeader>
            <CardContent className="p-0 sm:p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">No-shows</TableHead>
                    <TableHead className="text-right">Late cancels</TableHead>
                    <TableHead className="text-right">Doctor</TableHead>
                    <TableHead className="text-right">Hygiene</TableHead>
                    {summary.totals.other > 0 && <TableHead className="text-right">Other</TableHead>}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byMonth.map(m => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{m.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.noShows}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.lateCancels}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.doctor}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.hygiene}</TableCell>
                      {summary.totals.other > 0 && <TableCell className="text-right tabular-nums">{m.other}</TableCell>}
                      <TableCell className="text-right font-medium tabular-nums">{m.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="pb-2"><CardTitle className="text-base">By provider</CardTitle></CardHeader>
            <CardContent className="p-0 sm:p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">No-shows</TableHead>
                    <TableHead className="text-right">Late cancels</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byProvider.map(p => (
                    <TableRow key={p.key}>
                      <TableCell className="font-medium">{p.providerName}</TableCell>
                      <TableCell><DepartmentBadge department={p.department} /></TableCell>
                      <TableCell className="text-right tabular-nums">{p.noShows}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.lateCancels}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{p.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Every posting</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Primary provider</TableHead>
                    <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listed.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(e.business_date)}</TableCell>
                      <TableCell>
                        <Badge variant={e.code === '9100' ? 'destructive' : 'secondary'}>{e.code} · {MISSED_APPOINTMENT_CODE_LABELS[e.code]}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{e.provider_name}</TableCell>
                      <TableCell><DepartmentBadge department={e.department} /></TableCell>
                      <TableCell className="text-muted-foreground">{e.primary_provider_code ?? '—'}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Remove ${MISSED_APPOINTMENT_CODE_LABELS[e.code].toLowerCase()} for ${e.provider_name} on ${e.business_date}`}
                          onClick={() => setPendingDelete(e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {inRange.length > LIST_PREVIEW && (
                <div className="p-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => setShowAll(s => !s)}>
                    {showAll ? `Show the first ${LIST_PREVIEW}` : `Show all ${inRange.length}`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <MissedAppointmentImportDialog open={importOpen} onOpenChange={setImportOpen} existing={events ?? []} providers={providers ?? []} />

      <AlertDialog open={!!pendingDelete} onOpenChange={o => { if (!o) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this posting?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && `${MISSED_APPOINTMENT_CODE_LABELS[pendingDelete.code]} for ${pendingDelete.provider_name} on ${formatDate(pendingDelete.business_date)}. It will be added again if the same export is imported later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <Card className="card-elevated">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

function DepartmentBadge({ department }: { department: MissedAppointmentEvent['department'] }) {
  return <Badge variant="outline">{MISSED_APPOINTMENT_DEPARTMENT_LABELS[department]}</Badge>;
}
