import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "Returns the signed-in user's Purple Envelope identity: email, employee id, org id, org name, and role (owner, manager, or employee).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();

    const { data: membership, error: mErr } = await sb
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId!)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (mErr) return { content: [{ type: "text", text: mErr.message }], isError: true };
    if (!membership) {
      return { content: [{ type: "text", text: "No active org membership found." }], isError: true };
    }

    const { data: employee } = await sb
      .from("employees")
      .select("id, first_name, last_name, employment_status")
      .eq("org_id", membership.org_id)
      .eq("user_id", userId!)
      .maybeSingle();

    const { data: org } = await sb.from("orgs").select("name").eq("id", membership.org_id).maybeSingle();

    const payload = {
      email: ctx.getUserEmail() ?? null,
      user_id: userId,
      employee_id: employee?.id ?? null,
      first_name: employee?.first_name ?? null,
      last_name: employee?.last_name ?? null,
      employment_status: employee?.employment_status ?? null,
      org_id: membership.org_id,
      org_name: org?.name ?? null,
      role: membership.role,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
