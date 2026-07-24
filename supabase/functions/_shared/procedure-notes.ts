/**
 * Per-procedure wording & policy notes from the office fee schedule —
 * de-identified office configuration managers edit on the Fee Schedules
 * page. Loaded under the caller's JWT (RLS scopes to their org) and
 * hard-capped so prompts stay bounded. Used by name-visits,
 * fof-assistant, and ask-docs.
 */
// deno-lint-ignore no-explicit-any
export async function loadProcedureNotes(
  supabase: { from: (table: string) => any },
  maxEntries = 40,
  maxChars = 300
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("fee_schedule_items")
      .select("code, description, notes, fee_schedules!inner(kind)")
      .eq("fee_schedules.kind", "office")
      .neq("notes", "")
      .order("code")
      .limit(maxEntries);
    return ((data ?? []) as { code?: unknown; description?: unknown; notes?: unknown }[])
      .map((row) => {
        const code = typeof row.code === "string" ? row.code.trim() : "";
        const description =
          typeof row.description === "string" ? row.description.replace(/\s+/g, " ").trim() : "";
        const notes =
          typeof row.notes === "string"
            ? row.notes.replace(/\s+/g, " ").trim().slice(0, maxChars)
            : "";
        if (!code || !notes) return "";
        return `${code}${description ? ` (${description})` : ""}: ${notes}`;
      })
      .filter(Boolean);
  } catch {
    // Notes are a bonus — never fail the request over them.
    return [];
  }
}
