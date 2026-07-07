import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STRATEGIES = ["skip", "overwrite", "merge"] as const;
const APP_TZ = "America/New_York";

function validateConfirmImportInput(body: any): { import_id: string; strategy: string } {
  if (!body || typeof body !== "object") throw new Error("Invalid request body");
  const { import_id, strategy } = body;
  if (typeof import_id !== "string" || !UUID_REGEX.test(import_id)) {
    throw new Error("Invalid import_id format");
  }
  if (strategy && !VALID_STRATEGIES.includes(strategy)) {
    throw new Error("Invalid strategy. Must be one of: skip, overwrite, merge");
  }
  return { import_id, strategy: strategy || "skip" };
}

/**
 * Convert an Eastern wall-clock date+time (from PDF payroll reports) to a REAL UTC ISO string.
 * Uses Intl to look up the correct offset for the given moment, handling DST correctly.
 */
function easternWallToUtcIso(dateStr: string, hours: number, minutes: number): string {
  // Build a provisional UTC instant treating the wall-clock as UTC.
  const guess = new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`);
  // Determine the ET offset at that instant.
  const offsetMinutes = getEasternOffsetMinutes(guess);
  // If ET is UTC-5, the same wall clock in UTC is 5 hours later.
  const utcMs = guess.getTime() + Math.abs(offsetMinutes) * 60000 * Math.sign(-offsetMinutes) * -1;
  // Simpler: wallUTC + (-offset) minutes = actualUTC.
  // Eastern offsets are negative (e.g. -300 for EST). actualUTC = wallAsUtc + (0 - offsetMinutes).
  const actual = new Date(guess.getTime() - offsetMinutes * 60000);
  actual.setSeconds(0, 0);
  return actual.toISOString();
  // (utcMs is unused; explicit branch above kept for clarity if future edits reintroduce it.)
}

function getEasternOffsetMinutes(atInstant: Date): number {
  // Returns offset in minutes (e.g. -300 for EST, -240 for EDT).
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    timeZoneName: "shortOffset",
    year: "numeric",
  });
  const parts = dtf.formatToParts(atInstant);
  const tzName = parts.find(p => p.type === "timeZoneName")?.value || "GMT-5";
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return -300;
  const sign = m[1] === "+" ? 1 : -1;
  const h = parseInt(m[2], 10);
  const mm = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (h * 60 + mm);
}

function parseTimeString(cleaned: string): { hours: number; minutes: number } | null {
  const timeMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!timeMatch) return null;
  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const ampm = (timeMatch[3] || "").toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const rawBody = await req.json();
    const { import_id, strategy } = validateConfirmImportInput(rawBody);

    // Verify ownership + fetch import metadata
    const { data: importCheck, error: importCheckError } = await supabase
      .from("imports")
      .select("id, user_id, org_id, report_range_start, report_range_end")
      .eq("id", import_id)
      .single();

    if (importCheckError || !importCheck) {
      return new Response(
        JSON.stringify({ error: "Import not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve importer's own employee record + org
    const { data: importerEmp } = await supabase
      .from("employees")
      .select("id, org_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    const orgId = importCheck.org_id || importerEmp?.org_id;
    if (!orgId) throw new Error("No org context for import");

    // Preload all employees in this org for matching
    const { data: orgEmployees } = await supabase
      .from("employees")
      .select("id, user_id, employee_code, display_name")
      .eq("org_id", orgId);

    const empByCode = new Map<string, { id: string; user_id: string | null }>();
    const empByName = new Map<string, { id: string; user_id: string | null }[]>();
    for (const e of orgEmployees || []) {
      if (e.employee_code) empByCode.set(normalize(e.employee_code), { id: e.id, user_id: e.user_id });
      const k = normalize(e.display_name);
      if (k) {
        const list = empByName.get(k) || [];
        list.push({ id: e.id, user_id: e.user_id });
        empByName.set(k, list);
      }
    }

    function resolveEmployee(row: any): { id: string; user_id: string | null } | { ambiguous: true } | null {
      if (row.employee_code) {
        const hit = empByCode.get(normalize(row.employee_code));
        if (hit) return hit;
      }
      if (row.employee_name) {
        const hits = empByName.get(normalize(row.employee_name));
        if (hits && hits.length === 1) return hits[0];
        if (hits && hits.length > 1) return { ambiguous: true };
      }
      // Fallback: importer's own record
      if (importerEmp) return { id: importerEmp.id, user_id: user.id };
      return null;
    }

    // Get import rows
    const { data: rows, error: rowsError } = await supabase
      .from("import_rows")
      .select("*")
      .eq("import_id", import_id)
      .not("entry_date", "is", null);
    if (rowsError) throw rowsError;

    let imported = 0;
    let skipped = 0;
    const ambiguous: any[] = [];

    for (const row of rows || []) {
      const resolved = resolveEmployee(row);
      if (!resolved) {
        skipped++;
        continue;
      }
      if ("ambiguous" in resolved) {
        ambiguous.push({ entry_date: row.entry_date, employee_name: row.employee_name });
        await supabase.from("audit_events").insert({
          user_id: user.id,
          org_id: orgId,
          actor_id: user.id,
          event_type: "import_ambiguous_employee",
          event_details: { employee_name: row.employee_name, entry_date: row.entry_date, import_id },
          related_date: row.entry_date,
        });
        skipped++;
        continue;
      }
      const targetEmployeeId = resolved.id;
      const targetUserId = resolved.user_id;

      // Scoped lookup: this employee's entry on this date
      const { data: existing } = await supabase
        .from("time_entries")
        .select("id")
        .eq("employee_id", targetEmployeeId)
        .eq("entry_date", row.entry_date)
        .maybeSingle();

      if (existing && strategy === "skip") {
        skipped++;
        continue;
      }

      let entryId: string;
      let totalMin: number | null = null;
      if (row.total_hhmm) {
        const [h, m] = row.total_hhmm.split(":").map(Number);
        totalMin = h * 60 + (m || 0);
      }

      if (existing && strategy === "overwrite") {
        await supabase.from("punches").delete().eq("time_entry_id", existing.id);
        await supabase.from("time_entries").update({
          total_minutes: totalMin,
          raw_total_hhmm: row.total_hhmm,
          employee_name: row.employee_name,
          employee_code: row.employee_code,
          source: "import",
          raw_text: row.raw_text,
        }).eq("id", existing.id);
        entryId = existing.id;
      } else if (existing && strategy === "merge") {
        entryId = existing.id;
      } else {
        const { data: newEntry, error: entryError } = await supabase
          .from("time_entries")
          .insert({
            user_id: targetUserId || user.id,
            org_id: orgId,
            employee_id: targetEmployeeId,
            entry_date: row.entry_date,
            total_minutes: totalMin,
            raw_total_hhmm: row.total_hhmm,
            employee_name: row.employee_name,
            employee_code: row.employee_code,
            source: "import",
            raw_text: row.raw_text,
          })
          .select("id")
          .single();
        if (entryError) throw entryError;
        entryId = newEntry.id;
      }

      // Build punches — real UTC, DST-aware
      const punchTimes: string[] = row.punch_times || [];
      const punchInserts: any[] = [];
      for (let i = 0; i < punchTimes.length; i++) {
        const timeStr = punchTimes[i];
        const punchType = i % 2 === 0 ? "in" : "out";
        const cleaned = String(timeStr).replace(/\*/g, "").trim();
        const parsed = parseTimeString(cleaned);

        const punchTimestamp = parsed
          ? easternWallToUtcIso(row.entry_date, parsed.hours, parsed.minutes)
          : easternWallToUtcIso(row.entry_date, 12, 0);

        if (strategy === "merge" && existing) {
          const { data: dup } = await supabase
            .from("punches")
            .select("id")
            .eq("time_entry_id", entryId)
            .eq("punch_time", punchTimestamp)
            .maybeSingle();
          if (dup) continue;
        }

        punchInserts.push({
          time_entry_id: entryId,
          org_id: orgId,
          employee_id: targetEmployeeId,
          seq: i,
          punch_type: punchType,
          punch_time: punchTimestamp,
          source: "import",
          raw_text: timeStr,
        });
      }

      // Detect mispaired sequences before writing
      let mispaired = false;
      for (let i = 0; i < punchInserts.length - 1; i += 2) {
        if (punchInserts[i].punch_type !== "in" || punchInserts[i + 1]?.punch_type !== "out") {
          mispaired = true;
          break;
        }
      }
      if (mispaired) {
        await supabase.from("audit_events").insert({
          user_id: targetUserId || user.id,
          org_id: orgId,
          employee_id: targetEmployeeId,
          actor_id: user.id,
          event_type: "import_pairing_exception",
          event_details: {
            import_id,
            entry_date: row.entry_date,
            raw_times: punchTimes,
            note: "Punch sequence is not strict in/out; totals may be inaccurate.",
          },
          related_date: row.entry_date,
          related_entry_id: entryId,
        });
      }

      if (punchInserts.length > 0) {
        const { error: punchError } = await supabase.from("punches").insert(punchInserts);
        if (punchError) console.error("Punch insert error:", punchError);
      }

      // Import notes
      for (const note of row.note_lines || []) {
        if (note === "PAYROLL TOTAL") continue;
        await supabase.from("audit_events").insert({
          user_id: targetUserId || user.id,
          org_id: orgId,
          employee_id: targetEmployeeId,
          actor_id: user.id,
          event_type: "import_note",
          event_details: { note, source_file: row.import_id },
          related_date: row.entry_date,
          related_entry_id: entryId,
        });
      }

      imported++;
    }

    // Payroll summary — upsert
    const payrollRows = (rows || []).filter(r => r.entry_date === null && r.note_lines?.includes("PAYROLL TOTAL"));
    for (const pr of payrollRows) {
      if (!pr.total_hhmm) continue;
      const [h, m] = pr.total_hhmm.split(":").map(Number);
      await supabase.from("payroll_summaries").upsert({
        user_id: user.id,
        org_id: orgId,
        range_start: importCheck.report_range_start || "2000-01-01",
        range_end: importCheck.report_range_end || "2099-12-31",
        total_minutes: h * 60 + (m || 0),
        raw_total_hhmm: pr.total_hhmm,
        raw_text: pr.raw_text,
      }, { onConflict: "org_id,range_start,range_end" });
    }

    await supabase.from("imports").update({ status: "confirmed" }).eq("id", import_id);

    return new Response(
      JSON.stringify({ success: true, imported, skipped, ambiguous }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("confirm-import error:", err);
    return new Response(
      JSON.stringify({ error: "An error occurred confirming your import. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
