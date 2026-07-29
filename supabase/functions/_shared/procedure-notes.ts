/**
 * Per-procedure wording & policy notes from the fee schedules —
 * de-identified office configuration managers edit on the Fee Schedules
 * page. Loaded under the caller's JWT (RLS scopes to their org) and
 * hard-capped so prompts stay bounded.
 *
 * Notes live in one of two homes, and the difference matters:
 *
 *   OFFICE schedule  — universal guidance for that code. Applies to every
 *                      patient no matter which insurance they carry.
 *   CARRIER schedule — applies ONLY when billing that code to that
 *                      specific insurance (e.g. Delta Dental downgrades
 *                      it, BCBS wants a narrative).
 *
 * loadProcedureNotes returns the universal (office) set and is what
 * name-visits, fof-assistant, and ask-docs use. loadCodeNotes returns
 * both, labelled, for the Kimi agent.
 */

export interface CodeNote {
  code: string;
  description: string;
  notes: string;
  scheduleId: string;
  scheduleName: string;
  /** 'office' = universal; 'carrier'/'payment' = that insurance only. */
  scheduleKind: string;
}

interface RawRow {
  code?: unknown;
  description?: unknown;
  notes?: unknown;
  schedule_id?: unknown;
  fee_schedules?: { name?: unknown; kind?: unknown } | { name?: unknown; kind?: unknown }[] | null;
}

const text = (value: unknown, cap: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

/**
 * Every code note in the org, both universal and per-insurance.
 * Ordered office-first so universal guidance leads.
 */
// deno-lint-ignore no-explicit-any
export async function loadCodeNotes(
  supabase: { from: (table: string) => any },
  maxEntries = 120,
  maxChars = 400
): Promise<CodeNote[]> {
  try {
    const { data } = await supabase
      .from("fee_schedule_items")
      .select("code, description, notes, schedule_id, fee_schedules!inner(name, kind)")
      .neq("notes", "")
      .order("code")
      .limit(maxEntries);
    return ((data ?? []) as RawRow[])
      .map((row): CodeNote | null => {
        // PostgREST returns the embedded row as an object; tolerate arrays.
        const schedule = Array.isArray(row.fee_schedules) ? row.fee_schedules[0] : row.fee_schedules;
        const code = text(row.code, 12).toUpperCase();
        const notes = text(row.notes, maxChars);
        if (!code || !notes) return null;
        return {
          code,
          description: text(row.description, 120),
          notes,
          scheduleId: typeof row.schedule_id === "string" ? row.schedule_id : "",
          scheduleName: text(schedule?.name, 60) || "Unnamed schedule",
          scheduleKind: text(schedule?.kind, 20) || "carrier",
        };
      })
      .filter((n): n is CodeNote => n !== null)
      .sort((a, b) =>
        a.scheduleKind === b.scheduleKind
          ? a.code.localeCompare(b.code)
          : a.scheduleKind === "office"
            ? -1
            : 1
      );
  } catch {
    // Notes are a bonus — never fail the request over them.
    return [];
  }
}

/** One prompt line for a code note, stating where it applies. */
export function formatCodeNote(note: CodeNote): string {
  const scope =
    note.scheduleKind === "office"
      ? "ALL patients"
      : `${note.scheduleName} patients only`;
  return `${note.code}${note.description ? ` (${note.description})` : ""} [${scope}]: ${note.notes}`;
}

/**
 * Universal (office-schedule) notes as prompt lines. Unchanged contract —
 * name-visits, fof-assistant, and ask-docs rely on this shape.
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
    return ((data ?? []) as RawRow[])
      .map((row) => {
        const code = text(row.code, 12);
        const description = text(row.description, 120);
        const notes = text(row.notes, maxChars);
        if (!code || !notes) return "";
        return `${code}${description ? ` (${description})` : ""}: ${notes}`;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}
