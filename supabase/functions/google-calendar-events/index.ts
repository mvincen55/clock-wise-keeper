import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// HDA - Fairhaven office calendar
const OFFICE_CALENDAR_ID = 'c_ec5ac0a6b393eee3385575b2d90f671996c7cf900cbf54cb7618dc37b63f3a1e@group.calendar.google.com';
const GATEWAY = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function mapEvent(e: any) {
  return {
    id: e.id,
    summary: e.summary || '(no title)',
    description: e.description || null,
    location: e.location || null,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: !!e.start?.date,
    htmlLink: e.htmlLink,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const connKey = Deno.env.get('GOOGLE_CALENDAR_API_KEY');
    if (!lovableKey || !connKey) {
      return json({ error: 'Google Calendar connection not configured' }, 500);
    }

    const url = new URL(req.url);
    const calendarId = url.searchParams.get('calendarId') || OFFICE_CALENDAR_ID;
    const gwHeaders = {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': connKey,
      'Content-Type': 'application/json',
    };

    // ----- LIST -----
    if (req.method === 'GET') {
      const timeMin = url.searchParams.get('timeMin');
      const timeMax = url.searchParams.get('timeMax');
      if (!timeMin || !timeMax) return json({ error: 'timeMin and timeMax required' }, 400);

      const params = new URLSearchParams({
        timeMin, timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
      });
      const upstream = await fetch(
        `${GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: gwHeaders },
      );
      const body = await upstream.text();
      if (!upstream.ok) {
        console.error('GCal list error', upstream.status, body);
        return json({ error: 'Failed to fetch events' }, upstream.status);
      }
      const data = JSON.parse(body);
      return json({ events: (data.items || []).map(mapEvent) });
    }

    // ----- CREATE -----
    if (req.method === 'POST') {
      const payload = await req.json().catch(() => ({}));
      const { summary, description, location, start, end, allDay } = payload || {};
      if (!summary || !start) return json({ error: 'summary and start are required' }, 400);

      const body: any = {
        summary,
        description: description || undefined,
        location: location || undefined,
      };
      if (allDay) {
        // Google all-day end is exclusive; default to next day if missing
        const endDate = end || (() => {
          const d = new Date(start + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          return d.toISOString().slice(0, 10);
        })();
        body.start = { date: start };
        body.end = { date: endDate };
      } else {
        body.start = { dateTime: start, timeZone: 'America/New_York' };
        body.end = { dateTime: end || start, timeZone: 'America/New_York' };
      }

      const upstream = await fetch(
        `${GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events`,
        { method: 'POST', headers: gwHeaders, body: JSON.stringify(body) },
      );
      const text = await upstream.text();
      if (!upstream.ok) {
        console.error('GCal create error', upstream.status, text);
        return json({ error: 'Failed to create event' }, upstream.status);
      }
      return json({ event: mapEvent(JSON.parse(text)) });
    }

    // ----- UPDATE / DELETE need eventId -----
    const eventId = url.searchParams.get('eventId');
    if (!eventId) return json({ error: 'eventId required' }, 400);

    if (req.method === 'PATCH') {
      const payload = await req.json().catch(() => ({}));
      const { summary, description, location, start, end, allDay } = payload || {};
      const body: any = {};
      if (summary !== undefined) body.summary = summary;
      if (description !== undefined) body.description = description;
      if (location !== undefined) body.location = location;
      if (start) {
        body.start = allDay ? { date: start } : { dateTime: start, timeZone: 'America/New_York' };
      }
      if (end) {
        body.end = allDay ? { date: end } : { dateTime: end, timeZone: 'America/New_York' };
      }
      const upstream = await fetch(
        `${GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'PATCH', headers: gwHeaders, body: JSON.stringify(body) },
      );
      const text = await upstream.text();
      if (!upstream.ok) {
        console.error('GCal patch error', upstream.status, text);
        return json({ error: 'Failed to update event' }, upstream.status);
      }
      return json({ event: mapEvent(JSON.parse(text)) });
    }

    if (req.method === 'DELETE') {
      const upstream = await fetch(
        `${GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE', headers: gwHeaders },
      );
      if (!upstream.ok && upstream.status !== 410) {
        const text = await upstream.text();
        console.error('GCal delete error', upstream.status, text);
        return json({ error: 'Failed to delete event' }, upstream.status);
      }
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('google-calendar-events error', err);
    return json({ error: 'Internal error' }, 500);
  }
});
