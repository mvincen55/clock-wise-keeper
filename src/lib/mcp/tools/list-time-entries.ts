import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_time_entries",
  title: "List time entries",
  description:
    "Lists the signed-in user's own time entries (daily totals) between start_date and end_date (YYYY-MM-DD, inclusive, America/New_York calendar dates). Returns date, total minutes, and total hours.",
  inputSchema: {
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Start date (YYYY-MM-DD), inclusive."),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("End date (YYYY-MM-DD), inclusive."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("time_entries")
      .select("entry_date, total_minutes")
      .gte("entry_date", start_date)
      .lte("entry_date", end_date)
      .order("entry_date", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = (data ?? []).map((r: any) => ({
      date: r.entry_date,
      total_minutes: r.total_minutes ?? 0,
      total_hours: Number(((r.total_minutes ?? 0) / 60).toFixed(2)),
    }));
    const totalMinutes = rows.reduce((s, r) => s + r.total_minutes, 0);
    const payload = {
      start_date,
      end_date,
      count: rows.length,
      total_minutes: totalMinutes,
      total_hours: Number((totalMinutes / 60).toFixed(2)),
      entries: rows,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
