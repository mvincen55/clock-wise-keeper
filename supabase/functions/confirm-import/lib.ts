/**
 * Pure logic for confirm-import, extracted so it can be unit-tested
 * (vitest on the frontend side imports this file directly — keep it free
 * of Deno-specific imports).
 *
 * CONVENTION: punch_time in the database is REAL UTC. PDF payroll reports
 * carry Eastern wall-clock times; conversion must be DST-correct.
 */

const APP_TZ = "America/New_York";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STRATEGIES = ["skip", "overwrite", "merge"] as const;

export function validateConfirmImportInput(body: unknown): { import_id: string; strategy: string } {
  if (!body || typeof body !== "object") throw new Error("Invalid request body");
  const { import_id, strategy } = body as { import_id?: unknown; strategy?: unknown };
  if (typeof import_id !== "string" || !UUID_REGEX.test(import_id)) {
    throw new Error("Invalid import_id format");
  }
  if (strategy && !VALID_STRATEGIES.includes(strategy as typeof VALID_STRATEGIES[number])) {
    throw new Error("Invalid strategy. Must be one of: skip, overwrite, merge");
  }
  return { import_id, strategy: (strategy as string) || "skip" };
}

/** UTC offset of America/New_York in minutes at a given instant (-300 EST, -240 EDT). */
export function getEasternOffsetMinutes(atInstant: Date): number {
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

function easternWall(atInstant: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(atInstant);
  const get = (t: string) => parts.find(p => p.type === t)?.value || "00";
  let h = get("hour");
  if (h === "24") h = "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${h}:${get("minute")}` };
}

/**
 * Convert an Eastern wall-clock date+time (from PDF payroll reports) to a REAL UTC ISO string.
 *
 * DST-correct via double offset resolution: the offset at the provisional instant can be
 * stale near a transition, so the candidate is checked against the intended wall clock and
 * re-resolved once. Ambiguous times (fall-back hour) resolve to the earlier occurrence (EDT);
 * nonexistent times (spring-forward gap) shift forward (02:30 → 03:30 EDT).
 */
export function easternWallToUtcIso(dateStr: string, hours: number, minutes: number): string {
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const guess = new Date(`${dateStr}T${hh}:${mm}:00Z`);

  const candidate1 = new Date(guess.getTime() - getEasternOffsetMinutes(guess) * 60000);
  const w1 = easternWall(candidate1);
  if (w1.date === dateStr && w1.time === `${hh}:${mm}`) return candidate1.toISOString();

  const candidate2 = new Date(guess.getTime() - getEasternOffsetMinutes(candidate1) * 60000);
  const w2 = easternWall(candidate2);
  if (w2.date === dateStr && w2.time === `${hh}:${mm}`) return candidate2.toISOString();

  // Nonexistent wall time (spring-forward gap): no instant matches; candidate1 shifts forward.
  return candidate1.toISOString();
}

export function parseTimeString(cleaned: string): { hours: number; minutes: number } | null {
  const timeMatch = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!timeMatch) return null;
  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const ampm = (timeMatch[3] || "").toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}

export function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type BuiltPunch = {
  seq: number;
  punch_type: "in" | "out";
  punch_time: string;
  raw_text: string;
  parsed: boolean;
};

/**
 * Build the punch set for one import row. punch_type alternates positionally
 * (even = in, odd = out) because payroll PDFs list bare times.
 */
export function buildPunches(entryDate: string, punchTimes: string[]): BuiltPunch[] {
  return punchTimes.map((timeStr, i) => {
    const cleaned = String(timeStr).replace(/\*/g, "").trim();
    const parsed = parseTimeString(cleaned);
    return {
      seq: i,
      punch_type: i % 2 === 0 ? "in" : "out",
      punch_time: parsed
        ? easternWallToUtcIso(entryDate, parsed.hours, parsed.minutes)
        : easternWallToUtcIso(entryDate, 12, 0),
      raw_text: timeStr,
      parsed: parsed !== null,
    };
  });
}

/**
 * Detect mispaired/suspect punch sequences that should raise an audit exception.
 * Because punch_type is assigned positionally, type order can never be wrong by
 * construction — the real failure modes are:
 *  - odd punch count (unclosed shift)
 *  - unparseable time strings (defaulted to noon)
 *  - times out of chronological order (a missed punch shifts every pairing)
 */
export function detectMispaired(punches: BuiltPunch[]): { mispaired: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (punches.length % 2 !== 0) reasons.push("odd punch count (unclosed shift)");
  if (punches.some(p => !p.parsed)) reasons.push("unparseable punch time defaulted to 12:00 PM");
  for (let i = 0; i < punches.length - 1; i++) {
    if (new Date(punches[i].punch_time).getTime() > new Date(punches[i + 1].punch_time).getTime()) {
      reasons.push("punch times out of chronological order");
      break;
    }
  }
  return { mispaired: reasons.length > 0, reasons };
}
