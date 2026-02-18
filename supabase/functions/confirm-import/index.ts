import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STRATEGIES = ["skip", "overwrite", "merge"] as const;

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const rawBody = await req.json();
    const { import_id, strategy } = validateConfirmImportInput(rawBody);

    // Verify ownership via RLS - if user doesn't own it, this returns null
    const { data: importCheck, error: importCheckError } = await supabase
      .from("imports")
      .select("id, user_id")
      .eq("id", import_id)
      .single();

    if (importCheckError || !importCheck) {
      return new Response(
        JSON.stringify({ error: "Import not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    for (const row of rows || []) {
      // Check if entry exists for this date
      const { data: existing } = await supabase
        .from("time_entries")
        .select("id")
        .eq("entry_date", row.entry_date)
        .maybeSingle();

      if (existing && strategy === "skip") {
        skipped++;
        continue;
      }

      let entryId: string;

      if (existing && strategy === "overwrite") {
        await supabase.from("punches").delete().eq("time_entry_id", existing.id);
        
        let totalMin: number | null = null;
        if (row.total_hhmm) {
          const [h, m] = row.total_hhmm.split(":").map(Number);
          totalMin = h * 60 + (m || 0);
        }

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
        let totalMin: number | null = null;
        if (row.total_hhmm) {
          const [h, m] = row.total_hhmm.split(":").map(Number);
          totalMin = h * 60 + (m || 0);
        }

        const { data: newEntry, error: entryError } = await supabase
          .from("time_entries")
          .insert({
            user_id: user.id,
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

      // Insert punches
      const punchTimes: string[] = row.punch_times || [];
      const punchInserts: any[] = [];
      for (let i = 0; i < punchTimes.length; i++) {
        const timeStr = punchTimes[i];
        const punchType = i % 2 === 0 ? "in" : "out";

        let punchTimestamp: string;
        try {
          const dateStr = row.entry_date;
          const cleaned = timeStr.replace(/\*/g, '').trim();
          
          const timeMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            const ampm = (timeMatch[3] || '').toUpperCase();
            
            if (ampm === 'PM' && hours !== 12) hours += 12;
            if (ampm === 'AM' && hours === 12) hours = 0;
            
            const hh = hours.toString().padStart(2, '0');
            const mm = minutes.toString().padStart(2, '0');
            punchTimestamp = `${dateStr}T${hh}:${mm}:00`;
          } else {
            punchTimestamp = `${dateStr}T12:00:00`;
          }
        } catch {
          punchTimestamp = `${row.entry_date}T12:00:00`;
        }

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
          seq: i,
          punch_type: punchType,
          punch_time: punchTimestamp,
          source: "import",
          raw_text: timeStr,
        });
      }

      if (punchInserts.length > 0) {
        const { error: punchError } = await supabase.from("punches").insert(punchInserts);
        if (punchError) console.error("Punch insert error:", punchError);
      }

      // Insert audit notes
      for (const note of row.note_lines || []) {
        if (note === "PAYROLL TOTAL") continue;
        await supabase.from("audit_events").insert({
          user_id: user.id,
          event_type: "import_note",
          event_details: { note, source_file: row.import_id },
          related_date: row.entry_date,
          related_entry_id: entryId,
        });
      }

      imported++;
    }

    // Handle payroll summary rows
    const payrollRows = (rows || []).filter(r => r.entry_date === null && r.note_lines?.includes("PAYROLL TOTAL"));
    const { data: importRecord } = await supabase
      .from("imports")
      .select("report_range_start, report_range_end")
      .eq("id", import_id)
      .single();

    for (const pr of payrollRows) {
      if (pr.total_hhmm) {
        const [h, m] = pr.total_hhmm.split(":").map(Number);
        await supabase.from("payroll_summaries").insert({
          user_id: user.id,
          range_start: importRecord?.report_range_start || "2000-01-01",
          range_end: importRecord?.report_range_end || "2099-12-31",
          total_minutes: h * 60 + (m || 0),
          raw_total_hhmm: pr.total_hhmm,
          raw_text: pr.raw_text,
        });
      }
    }

    // Update import status
    await supabase.from("imports").update({ status: "confirmed" }).eq("id", import_id);

    return new Response(
      JSON.stringify({ success: true, imported, skipped }),
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
