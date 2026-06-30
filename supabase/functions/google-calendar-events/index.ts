import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// HDA - Fairhaven office calendar
const OFFICE_CALENDAR_ID = 'c_ec5ac0a6b393eee3385575b2d90f671996c7cf900cbf54cb7618dc37b63f3a1e@group.calendar.google.com';
const GATEWAY = 'https://connector-gateway.lovable.dev/google_calendar/calendar/v3';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const connKey = Deno.env.get('GOOGLE_CALENDAR_API_KEY');
    if (!lovableKey || !connKey) {
      return new Response(
        JSON.stringify({ error: 'Google Calendar connection not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const url = new URL(req.url);
    const timeMin = url.searchParams.get('timeMin');
    const timeMax = url.searchParams.get('timeMax');
    const calendarId = url.searchParams.get('calendarId') || OFFICE_CALENDAR_ID;

    if (!timeMin || !timeMax) {
      return new Response(
        JSON.stringify({ error: 'timeMin and timeMax are required (ISO 8601)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });

    const upstream = await fetch(
      `${GATEWAY}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': connKey,
        },
      },
    );

    const body = await upstream.text();
    if (!upstream.ok) {
      console.error('Google Calendar gateway error', upstream.status, body);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Google Calendar events' }),
        { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = JSON.parse(body);
    const events = (data.items || []).map((e: any) => ({
      id: e.id,
      summary: e.summary || '(no title)',
      description: e.description || null,
      location: e.location || null,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      allDay: !!e.start?.date,
      htmlLink: e.htmlLink,
    }));

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('google-calendar-events error', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
