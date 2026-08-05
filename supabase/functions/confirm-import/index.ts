import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

import { validateConfirmImportInput, normalize, buildPunches, detectMispaired } from "./lib.ts";

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

    // Refuse in the caller's own terms. Throwing here fell into the catch
    // below and came back as a 500, which reads like a broken import rather
    // than a closed door.
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Sign in to confirm an import." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Preload all employees in this org for matching.
    // NOTE: employees has no employee_code column — matching is by display_name.
    // Selecting a nonexistent column here used to error out silently, leaving the
    // match maps empty so every row fell back to the importer's own record.
    const { data: orgEmployees, error: orgEmployeesError } = await supabase
      .from("employees")
      .select("id, user_id, display_name")
      .eq("org_id", orgId);
    if (orgEmployeesError) throw orgEmployeesError;

    const empByName = new Map<string, { id: string; user_id: string | null }[]>();
    for (const e of orgEmployees || []) {
      const k = normalize(e.display_name);
      if (k) {
        const list = empByName.get(k) || [];
        list.push({ id: e.id, user_id: e.user_id });
        empByName.set(k, list);
      }
    }
    // TS cannot carry the null-narrowing of `user` into this closure.
    const importerUserId = user.id;

    function resolveEmployee(row: any): { id: string; user_id: string | null } | { ambiguous: true } | null {
      if (row.employee_name) {
        const hits = empByName.get(normalize(row.employee_name));
        if (hits && hits.length === 1) return hits[0];
        if (hits && hits.length > 1) return { ambiguous: true };
        // Named employee with no match: do NOT attribute to the importer.
        return null;
      }
      // Row carries no employee identity (single-employee report): importer's own record.
      if (importerEmp) return { id: importerEmp.id, user_id: importerUserId };
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
        if (row.employee_name) {
          await supabase.from("audit_events").insert({
            user_id: user.id,
            org_id: orgId,
            actor_id: user.id,
            event_type: "import_unmatched_employee",
            event_details: { employee_name: row.employee_name, entry_date: row.entry_date, import_id },
            related_date: row.entry_date,
          });
        }
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
      const builtPunches = buildPunches(row.entry_date, punchTimes);
      const punchInserts: any[] = [];
      for (const bp of builtPunches) {
        if (strategy === "merge" && existing) {
          const { data: dup } = await supabase
            .from("punches")
            .select("id")
            .eq("time_entry_id", entryId)
            .eq("punch_time", bp.punch_time)
            .maybeSingle();
          if (dup) continue;
        }

        punchInserts.push({
          time_entry_id: entryId,
          org_id: orgId,
          employee_id: targetEmployeeId,
          seq: bp.seq,
          punch_type: bp.punch_type,
          punch_time: bp.punch_time,
          source: "import",
          raw_text: bp.raw_text,
        });
      }

      // Detect mispaired/suspect sequences before writing (checks the full built
      // set, not the merge-filtered inserts, so dedup can't mask a bad sequence)
      const { mispaired, reasons: mispairReasons } = detectMispaired(builtPunches);
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
            reasons: mispairReasons,
            note: "Suspect punch sequence; totals may be inaccurate.",
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
