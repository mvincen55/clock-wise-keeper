import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const reportType = url.searchParams.get("report_type");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");

    if (!reportType || !startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "Missing report_type, start_date, or end_date" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data: Record<string, unknown>[] = [];
    let filename = `${reportType}_${startDate}_${endDate}.csv`;
    let columns: string[] = [];

    switch (reportType) {
      case "timesheet": {
        const { data: rows, error } = await supabase
          .from("v_timesheet_day")
          .select("*")
          .gte("entry_date", startDate)
          .lte("entry_date", endDate)
          .order("entry_date", { ascending: true });
        if (error) throw error;
        data = rows || [];
        columns = [
          "entry_date",
          "schedule_expected_start",
          "schedule_expected_end",
          "first_in",
          "last_out",
          "total_minutes",
          "minutes_late",
          "status_code",
          "day_off_type",
          "office_closed",
          "is_remote",
          "has_edits",
          "edit_count",
          "entry_comment",
        ];
        break;
      }
      case "exceptions": {
        const { data: rows, error } = await supabase
          .from("v_exceptions")
          .select("*")
          .gte("entry_date", startDate)
          .lte("entry_date", endDate)
          .order("entry_date", { ascending: true });
        if (error) throw error;
        data = rows || [];
        columns = [
          "entry_date",
          "status_code",
          "minutes_late",
          "tardy_approval_status",
          "tardy_reason",
          "suggested_action",
          "timezone_suspect",
        ];
        break;
      }
      case "pto": {
        const { data: rows, error } = await supabase
          .from("v_pto_ledger")
          .select("*")
          .gte("period_start", startDate)
          .lte("period_end", endDate)
          .order("period_start", { ascending: true });
        if (error) throw error;
        data = rows || [];
        columns = [
          "period_start",
          "period_end",
          "worked_hours_raw",
          "worked_hours_capped",
          "tier_rate",
          "calculated_accrual",
          "accrual_credited",
          "pto_taken_hours",
          "running_balance",
          "weekly_cap",
          "cap_applied",
        ];
        break;
      }
      case "audit": {
        const { data: rows, error } = await supabase
          .from("v_audit_trail")
          .select("*")
          .gte("event_timestamp", `${startDate}T00:00:00`)
          .lte("event_timestamp", `${endDate}T23:59:59`)
          .order("event_timestamp", { ascending: true });
        if (error) throw error;
        data = rows || [];
        columns = [
          "event_timestamp",
          "event_type",
          "related_date",
          "reason_comment",
          "before_value",
          "after_value",
        ];
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown report_type: ${reportType}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    // Build CSV
    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerRow = columns.join(",");
    const csvRows = data.map((row) =>
      columns.map((col) => escapeCsv(row[col])).join(",")
    );
    const csv = [headerRow, ...csvRows].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
