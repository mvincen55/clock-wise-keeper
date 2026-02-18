import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validateLocationInput(body: any): { lat: number; lng: number; accuracy: number | null; timestamp: string } {
  if (!body || typeof body !== "object") throw new Error("Invalid request body");

  const { lat, lng, accuracy, timestamp } = body;

  if (typeof lat !== "number" || lat < -90 || lat > 90) {
    throw new Error("Invalid latitude (must be -90 to 90)");
  }
  if (typeof lng !== "number" || lng < -180 || lng > 180) {
    throw new Error("Invalid longitude (must be -180 to 180)");
  }

  let validatedAccuracy: number | null = null;
  if (accuracy != null) {
    if (typeof accuracy !== "number" || accuracy < 0) {
      throw new Error("Invalid accuracy (must be >= 0)");
    }
    // Cap at 100km but don't reject - GPS can report very high values
    validatedAccuracy = Math.min(accuracy, 100000);
  }

  let validatedTimestamp = new Date().toISOString();
  if (timestamp) {
    const ts = new Date(timestamp);
    if (isNaN(ts.getTime())) throw new Error("Invalid timestamp format");
    const now = Date.now();
    const dayAgo = now - 86400000;
    const hourAhead = now + 3600000;
    if (ts.getTime() < dayAgo || ts.getTime() > hourAhead) {
      throw new Error("Timestamp out of acceptable range");
    }
    validatedTimestamp = ts.toISOString();
  }

  return { lat, lng, accuracy: validatedAccuracy, timestamp: validatedTimestamp };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use anon key with user's auth context - respects RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const rawBody = await req.json();
    const { lat, lng, accuracy, timestamp: now } = validateLocationInput(rawBody);

    const lowConfidence = accuracy != null && accuracy > 100;

    // Resolve user's timezone for local date calculation
    const { data: tzData } = await supabase.rpc('get_user_timezone', { p_user_id: user.id });
    const userTz = tzData || 'America/New_York';

    // Compute today's date in the user's local timezone (not UTC!)
    const nowMs = new Date(now).getTime();
    const localDateStr = new Date(now).toLocaleString('en-CA', { timeZone: userTz }).split(',')[0]; // YYYY-MM-DD format
    const today = localDateStr;

    // Get active work zones for user (RLS enforces ownership)
    const { data: zones } = await supabase
      .from("work_zones")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true);

    if (!zones?.length) {
      return new Response(JSON.stringify({
        action_taken: "none",
        zone: null,
        reason: "no_active_zones",
        confidence_flag: !lowConfidence,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find closest zone and check if inside
    let matchedZone: any = null;
    let insideZone = false;

    for (const zone of zones) {
      const dist = haversineDistance(lat, lng, zone.latitude, zone.longitude);
      if (dist <= zone.radius_meters) {
        matchedZone = zone;
        insideZone = true;
        break;
      }
    }

    // Get last location event for this user to determine status change
    const { data: lastEvents } = await supabase
      .from("location_events")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastEvent = lastEvents?.[0];
    const lastStatus = lastEvent?.zone_status;
    const lastZoneId = lastEvent?.zone_id;

    // Determine zone status
    let zoneStatus: string;
    if (insideZone) {
      zoneStatus = (lastStatus === "inside" || lastStatus === "entered") && lastZoneId === matchedZone?.id
        ? "inside"
        : "entered";
    } else {
      zoneStatus = (lastStatus === "inside" || lastStatus === "entered")
        ? "exited"
        : "outside";
    }

    // Determine if we need to apply delay checks
    let actionTaken = "none";
    let reason = "no_status_change";
    let punchId: string | null = null;

    // today is already computed above using user's local timezone

    if (zoneStatus === "entered" && matchedZone) {
      const delayMs = (matchedZone.enter_delay_minutes || 2) * 60000;
      if (lastEvent) {
        const timeSinceLast = new Date(now).getTime() - new Date(lastEvent.created_at).getTime();
        if (timeSinceLast < delayMs) {
          reason = "enter_delay_not_met";
          zoneStatus = "inside";
        }
      }

      if (zoneStatus === "entered") {
        const { data: todayEntry } = await supabase
          .from("time_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("entry_date", today)
          .maybeSingle();

        if (todayEntry) {
          const { data: lastPunch } = await supabase
            .from("punches")
            .select("punch_type")
            .eq("time_entry_id", todayEntry.id)
            .order("seq", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastPunch?.punch_type === "in") {
            actionTaken = "none";
            reason = "already_clocked_in";
          } else {
            const result = await createAutoPunch(supabase, user.id, today, "in", now, lowConfidence, lat, lng, todayEntry.id);
            actionTaken = "auto_clock_in";
            reason = "entered_zone";
            punchId = result.punchId;
          }
        } else {
          const result = await createAutoPunch(supabase, user.id, today, "in", now, lowConfidence, lat, lng, null);
          actionTaken = "auto_clock_in";
          reason = "entered_zone";
          punchId = result.punchId;
        }
      }
    } else if (zoneStatus === "exited") {
      const exitZone = matchedZone || zones[0];
      const delayMs = (exitZone?.exit_delay_minutes || 5) * 60000;
      if (lastEvent) {
        const timeSinceLast = new Date(now).getTime() - new Date(lastEvent.created_at).getTime();
        if (timeSinceLast < delayMs) {
          reason = "exit_delay_not_met";
          zoneStatus = "outside";
        }
      }

      if (zoneStatus === "exited") {
        const { data: todayEntry } = await supabase
          .from("time_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("entry_date", today)
          .maybeSingle();

        if (todayEntry) {
          const { data: lastPunch } = await supabase
            .from("punches")
            .select("punch_type")
            .eq("time_entry_id", todayEntry.id)
            .order("seq", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastPunch?.punch_type === "out" || !lastPunch) {
            actionTaken = "none";
            reason = "already_clocked_out";
          } else {
            const result = await createAutoPunch(supabase, user.id, today, "out", now, lowConfidence, lat, lng, todayEntry.id);
            actionTaken = "auto_clock_out";
            reason = "exited_zone";
            punchId = result.punchId;
          }
        } else {
          actionTaken = "none";
          reason = "no_entry_to_clock_out";
        }
      }
    }

    // Log location event
    await supabase.from("location_events").insert({
      user_id: user.id,
      latitude: lat,
      longitude: lng,
      accuracy,
      zone_id: matchedZone?.id || null,
      zone_status: zoneStatus,
      action_taken: actionTaken,
      confidence_flag: !lowConfidence,
      punch_id: punchId,
    });

    return new Response(JSON.stringify({
      action_taken: actionTaken,
      zone: matchedZone?.zone_name || null,
      reason,
      confidence_flag: !lowConfidence,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("process-location-event error:", e);
    return new Response(JSON.stringify({ error: "An error occurred processing your location. Please try again." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function createAutoPunch(
  supabase: any,
  userId: string,
  date: string,
  punchType: "in" | "out",
  punchTime: string,
  lowConfidence: boolean,
  lat: number,
  lng: number,
  existingEntryId: string | null
) {
  let entryId = existingEntryId;

  if (!entryId) {
    const { data: newEntry, error } = await supabase
      .from("time_entries")
      .insert({ user_id: userId, entry_date: date, source: "auto_location" })
      .select("id")
      .single();
    if (error) throw error;
    entryId = newEntry.id;
  }

  // Get next seq
  const { data: maxPunch } = await supabase
    .from("punches")
    .select("seq")
    .eq("time_entry_id", entryId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSeq = (maxPunch?.seq ?? -1) + 1;

  const { data: punch, error: punchError } = await supabase
    .from("punches")
    .insert({
      time_entry_id: entryId,
      seq: nextSeq,
      punch_type: punchType,
      punch_time: punchTime,
      source: "auto_location",
      low_confidence: lowConfidence,
      location_lat: lat,
      location_lng: lng,
    })
    .select("id")
    .single();

  if (punchError) throw punchError;

  // Update total_minutes
  const { data: allPunches } = await supabase
    .from("punches")
    .select("punch_type, punch_time")
    .eq("time_entry_id", entryId)
    .order("seq");

  if (allPunches) {
    let total = 0;
    for (let i = 0; i < allPunches.length - 1; i += 2) {
      if (allPunches[i].punch_type === "in" && allPunches[i + 1]?.punch_type === "out") {
        const inT = new Date(allPunches[i].punch_time).getTime();
        const outT = new Date(allPunches[i + 1].punch_time).getTime();
        total += (outT - inT) / 60000;
      }
    }
    await supabase.from("time_entries").update({ total_minutes: Math.round(total) }).eq("id", entryId);
  }

  // Audit
  await supabase.from("audit_events").insert({
    user_id: userId,
    event_type: `auto_${punchType}`,
    event_details: {
      punch_time: punchTime,
      source: "auto_location",
      low_confidence: lowConfidence,
      lat,
      lng,
    },
    related_date: date,
    related_entry_id: entryId,
  });

  return { punchId: punch.id, entryId };
}
