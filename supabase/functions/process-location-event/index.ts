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

// Current instant in real UTC (seconds/ms zeroed).
function nowUtcIso(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
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
    validatedAccuracy = Math.min(accuracy, 100000);
  }

  let validatedTimestamp = nowUtcIso();
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
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Punch writes go through _record_punch_internal (service role only):
    // employees no longer hold INSERT policies on time_entries/punches, and
    // the shared SQL core owns alternation, seq, and audit semantics.
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Validate user via getClaims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    const rawBody = await req.json();
    const { lat, lng, accuracy, timestamp: now } = validateLocationInput(rawBody);

    const lowConfidence = accuracy != null && accuracy > 100;

    // Resolve employee record for org_id and employee_id
    const { data: empData, error: empError } = await supabase
      .from("employees")
      .select("id, org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (empError || !empData) {
      return new Response(JSON.stringify({
        action_taken: "none",
        zone: null,
        reason: "no_employee_record",
        confidence_flag: !lowConfidence,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const employeeId = empData.id;
    const orgId = empData.org_id;
    // entry_date is derived inside _record_punch_internal from the punch
    // instant and get_user_timezone — no client-side date math here.

    // Get active work zones for user (RLS enforces ownership)
    const { data: zones } = await supabase
      .from("work_zones")
      .select("*")
      .eq("user_id", userId)
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
      .eq("user_id", userId)
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
        const result = await recordAutoPunch(admin, employeeId, userId, "in", now, lowConfidence, lat, lng);
        if (result.ok) {
          actionTaken = "auto_clock_in";
          reason = "entered_zone";
          punchId = result.punchId;
        } else {
          actionTaken = "none";
          reason = "already_clocked_in";
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
        // The SQL core also owns the midnight continuation rule: an exit
        // shortly after midnight closes yesterday's still-open entry
        // instead of skipping (the old path required a same-day entry).
        const result = await recordAutoPunch(admin, employeeId, userId, "out", now, lowConfidence, lat, lng);
        if (result.ok) {
          actionTaken = "auto_clock_out";
          reason = "exited_zone";
          punchId = result.punchId;
        } else {
          actionTaken = "none";
          reason = "no_open_clock_in";
        }
      }
    }

    // Log location event
    await supabase.from("location_events").insert({
      user_id: userId,
      org_id: orgId,
      employee_id: employeeId,
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

type AutoPunchResult =
  | { ok: true; punchId: string; entryId: string }
  | { ok: false; rejection: "already_in" | "no_open_in" };

// One punch-writing path for the whole system: _record_punch_internal
// owns entry upsert, midnight continuation, alternation, seq assignment,
// and the audit row — this function only relays the zone decision. The
// validated event timestamp is passed through (bounded to −24h/+1h by
// validateLocationInput above); an alternation rejection is a normal
// no-op here, never an error.
async function recordAutoPunch(
  admin: any,
  employeeId: string,
  actorUserId: string,
  punchType: "in" | "out",
  punchTime: string,
  lowConfidence: boolean,
  lat: number,
  lng: number
): Promise<AutoPunchResult> {
  const { data, error } = await admin.rpc("_record_punch_internal", {
    p_employee_id: employeeId,
    p_action: punchType === "in" ? "clock_in" : "clock_out",
    p_source: "auto_location",
    p_punch_time: punchTime,
    p_low_confidence: lowConfidence,
    p_lat: lat,
    p_lng: lng,
    p_actor: actorUserId,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("PUNCH_ALREADY_IN")) return { ok: false, rejection: "already_in" };
    if (msg.includes("PUNCH_NO_OPEN_IN")) return { ok: false, rejection: "no_open_in" };
    throw error;
  }

  return { ok: true, punchId: data.punch_id, entryId: data.entry_id };
}
