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
  name: "list_pto_requests",
  title: "List PTO requests",
  description:
    "Lists the signed-in user's own PTO requests, most recent first. Optionally filter by status (pending, approved, denied, canceled).",
  inputSchema: {
    status: z
      .enum(["pending", "approved", "denied", "canceled", "any"])
      .optional()
      .describe("Filter by status. Default 'any'."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("pto_requests")
      .select("id, start_date, end_date, hours, status, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (status && status !== "any") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const payload = { count: data?.length ?? 0, requests: data ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
