/**
 * What a problem report was *about* — the exact day, timesheet or imported
 * report on screen when it was filed — so any status update can send you
 * straight back to it instead of making you go find it again.
 */

const prettyDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export type TicketContext = { path: string; label: string };

/**
 * Build a deep link back to the record a report came from. The date range the
 * person confirmed in the widget always wins, so the link reopens the same
 * window of time the report describes.
 */
export function buildTicketContext(
  pathname: string,
  search: string,
  rangeStart?: string | null,
  rangeEnd?: string | null,
): TicketContext {
  const params = new URLSearchParams(search);
  if (rangeStart) params.set('from', rangeStart);
  if (rangeEnd) params.set('to', rangeEnd);
  const qs = params.toString();
  const path = qs ? `${pathname}?${qs}` : pathname;

  const range =
    rangeStart && rangeEnd
      ? rangeStart === rangeEnd
        ? prettyDay(rangeStart)
        : `${prettyDay(rangeStart)} – ${prettyDay(rangeEnd)}`
      : '';

  let what = 'this page';
  if (pathname.startsWith('/timesheet')) what = 'timesheet';
  else if (pathname.startsWith('/imports') || pathname.startsWith('/import')) what = 'imported report';
  else if (pathname.startsWith('/reports')) what = 'report';
  else if (pathname.startsWith('/attendance')) what = 'attendance';
  else if (pathname.startsWith('/pto')) what = 'time off';
  else if (pathname.startsWith('/schedule')) what = 'schedule';
  else if (pathname.startsWith('/team')) what = 'team';
  else if (pathname === '/' || pathname.startsWith('/dashboard')) what = 'time clock';

  const importId = params.get('import') ?? params.get('import_id');
  if (importId) what = 'imported report';

  return { path, label: range ? `${what} · ${range}` : what };
}
