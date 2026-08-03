// INTEGRITY SIGNATURES — the pure core of the jailbreak detector.
//
// No Deno-only imports live here on purpose: this file is the unit under test,
// so both the Edge runtime and the Vitest suite import the same code.
//
// The rule this file exists to keep: what gets recorded is the PATTERN that
// matched — never the text a person typed, never a snippet, never a hash of
// content. Message and conversation content is off limits, always.

export type JailbreakSignature =
  | "instruction_override"
  | "system_prompt_extraction"
  | "role_impersonation"
  | "policy_override"
  | "other_employee_data"
  | "patient_data_injection";

export type Severity = "watch" | "elevated";

interface SignatureRule {
  signature: JailbreakSignature;
  /** Plain-English description of the pattern — safe to store and display. */
  label: string;
  severity: Severity;
  patterns: RegExp[];
}

const RULES: SignatureRule[] = [
  {
    signature: "instruction_override",
    label: "Attempt to override the assistant's standing instructions",
    severity: "watch",
    patterns: [
      /\bignore (all |any |your |the )?(previous|prior|above|earlier|preceding)\b/i,
      /\bdisregard (all |any |your |the )?(previous|prior|above|earlier|instructions|rules)\b/i,
      /\bforget (everything|all|your) (you|instructions|rules|training)\b/i,
      /\bnew instructions?\s*:/i,
      /\boverride (your |the )?(instructions|rules|system|doctrine)\b/i,
    ],
  },
  {
    signature: "system_prompt_extraction",
    label: "Attempt to reveal the system prompt or hidden instructions",
    severity: "watch",
    patterns: [
      /\b(show|print|repeat|reveal|output|display|give me)\b[^.?!]{0,40}\b(system|initial|hidden|original)\b[^.?!]{0,20}\b(prompt|instructions?|message)\b/i,
      /\bwhat (are|were) your (system |original |initial )?(instructions|rules|prompt)\b/i,
      /\brepeat (everything|the text) above\b/i,
    ],
  },
  {
    signature: "role_impersonation",
    label: "Attempt to change the assistant's identity or unlock a different mode",
    severity: "watch",
    patterns: [
      /\bpretend (you are|to be|you're)\b/i,
      /\byou are now\b[^.?!]{0,40}\b(dan|developer mode|unrestricted|jailbroken|no rules)\b/i,
      /\b(developer|god|admin|debug) mode\b/i,
      /\bact as (an? )?(unrestricted|uncensored|unfiltered)\b/i,
      /\bdo anything now\b/i,
    ],
  },
  {
    signature: "policy_override",
    label: "Attempt to make the assistant contradict standing office rules",
    severity: "elevated",
    patterns: [
      /\bignore (the )?(office|company|practice|hr) (rules|policy|policies)\b/i,
      /\b(without|bypass|skip|get around)\b[^.?!]{0,25}\b(policy|policies|approval|manager|owner)\b/i,
      /\bdon'?t (log|record|audit|report) this\b/i,
      /\bkeep this (off the record|between us|secret from)\b/i,
    ],
  },
  {
    signature: "other_employee_data",
    label: "Attempt to pull another team member's private records",
    severity: "elevated",
    patterns: [
      /\b(show|give|list|tell) me\b[^.?!]{0,40}\b(everyone|another|other|someone else'?s?|other people'?s?)\b[^.?!]{0,30}\b(pay|salary|wage|write[- ]?up|discipline|record|records|hours|ssn|social security|address|phone)\b/i,
      /\b(pay|salary|wage|ssn|social security)\b[^.?!]{0,25}\bfor (the rest of|everyone|all|the other)\b/i,
      /\bread (their|his|her|everyone'?s) (messages|dms|conversations|chats)\b/i,
    ],
  },
  {
    signature: "patient_data_injection",
    label: "Attempt to put patient identifiers into the assistant",
    severity: "elevated",
    patterns: [
      /\bpatient\b[^.?!]{0,30}\b(name|dob|date of birth|ssn|chart number|mrn|insurance id)\b/i,
      /\b(mrn|chart #|chart number)\s*[:#]/i,
    ],
  },
];

export interface JailbreakScan {
  flagged: boolean;
  signature?: JailbreakSignature;
  label?: string;
  severity?: Severity;
}

/**
 * Scan text for attack signatures. Returns only the matched pattern's identity
 * — the caller never receives, and must never store, the scanned text.
 */
export function scanForJailbreak(input: unknown): JailbreakScan {
  const text = typeof input === "string" ? input : "";
  if (!text || text.length > 20_000) return { flagged: false };
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        flagged: true,
        signature: rule.signature,
        label: rule.label,
        severity: rule.severity,
      };
    }
  }
  return { flagged: false };
}

/** Scan the newest user turn of a chat array. Earlier turns were already scanned. */
export function scanLatestUserTurn(messages: unknown): JailbreakScan {
  if (!Array.isArray(messages)) return { flagged: false };
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: string } | null;
    if (m && m.role === "user") return scanForJailbreak(m.content);
  }
  return { flagged: false };
}

/** Eastern calendar day — the office's day, everywhere in this app. */
export function easternDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** One event per actor + surface + signature per Eastern day — no re-reporting. */
export function fingerprintFor(
  orgId: string,
  actorId: string | null,
  surface: string,
  signature: string,
  now: Date = new Date(),
): string {
  return `ai_jailbreak:${orgId}:${actorId ?? "anon"}:${surface}:${signature}:${easternDay(now)}`;
}

export interface SecurityEventRow {
  org_id: string;
  actor_user_id: string | null;
  kind: "ai_jailbreak";
  severity: Severity;
  status: "open";
  fingerprint: string;
  detail: Record<string, unknown>;
}

/** Build the row. Signature only — no prompt text, no snippet, no content hash. */
export function buildSecurityEvent(args: {
  orgId: string;
  actorUserId: string | null;
  surface: string;
  scan: JailbreakScan;
  now?: Date;
}): SecurityEventRow {
  const { orgId, actorUserId, surface, scan } = args;
  return {
    org_id: orgId,
    actor_user_id: actorUserId,
    kind: "ai_jailbreak",
    severity: scan.severity ?? "watch",
    status: "open",
    fingerprint: fingerprintFor(orgId, actorUserId, surface, scan.signature!, args.now),
    detail: {
      surface,
      signature: scan.signature,
      pattern: scan.label,
      note: "Signature match only — no conversation content is stored or scanned.",
    },
  };
}

/** Elevated signatures wake someone up. Watch-level ones just sit in the log. */
export function isElevated(scan: JailbreakScan): boolean {
  return scan.flagged && scan.severity === "elevated";
}

export interface AdminAlert {
  org_id: string;
  recipient_user_id: string;
  actor_user_id: null;
  notification_type: "integrity_elevated";
  title: string;
  message: string;
  related_table: "security_events";
  related_id: string | null;
}

/**
 * Alerts for an elevated signature. The actor is never a recipient — nobody
 * gets tipped off that they tripped a detector — and the alert names the
 * pattern, never the person's words.
 */
export function buildAdminAlerts(args: {
  event: SecurityEventRow;
  eventId: string | null;
  adminUserIds: string[];
  scan: JailbreakScan;
}): AdminAlert[] {
  const { event, eventId, adminUserIds, scan } = args;
  const recipients = adminUserIds.filter(
    (id) => id && id !== event.actor_user_id,
  );
  const unique = Array.from(new Set(recipients));
  return unique.map((rid) => ({
    org_id: event.org_id,
    recipient_user_id: rid,
    actor_user_id: null,
    notification_type: "integrity_elevated" as const,
    title: "Integrity signal worth a look",
    message: `${scan.label} — seen on ${event.detail.surface}. Signature only; no conversation content was read or stored. Review it in Settings → Integrity & Safety.`,
    related_table: "security_events" as const,
    related_id: eventId,
  }));
}

/**
 * How many elevated alert emails one org may receive in a single Eastern day.
 * Past the cap the in-app review item is still created — only the email stops,
 * and the daily owners digest picks up whatever the throttle held back.
 */
export const ELEVATED_EMAIL_DAILY_CAP = 3;

/** The store the recorder writes through — kept tiny so tests can fake it. */
export interface IntegrityStore {
  /** True when this fingerprint already has an open or dismissed event. */
  hasEvent(fingerprint: string): Promise<boolean>;
  /** Insert the event; returns its id when the store provides one. */
  insertEvent(row: SecurityEventRow): Promise<string | null>;
  /** Org admins (owners + managers) who can receive an elevated alert. */
  listAdmins(orgId: string): Promise<string[]>;
  insertNotifications(rows: AdminAlert[]): Promise<void>;
  /** Optional email fanout for elevated signals. */
  sendEmails?(rows: AdminAlert[]): Promise<void>;
  /** Elevated events already emailed for this org on this Eastern day. */
  countEmailedToday?(orgId: string, day: string): Promise<number>;
  /** Mark an event as having triggered an email, so the cap can count it. */
  markEmailed?(eventId: string): Promise<void>;
}

export interface RecordOutcome {
  recorded: boolean;
  deduped: boolean;
  alerted: number;
  emailed: number;
  /** True when the email was withheld by the daily cap (digest will cover it). */
  emailThrottled: boolean;
}

/**
 * Record a flagged signature: dedupe, insert, and — only for elevated
 * signatures — alert the admins who aren't the actor. Fail-open throughout:
 * detection never blocks a person's work.
 */
export async function recordJailbreakSignature(
  store: IntegrityStore,
  args: {
    orgId: string;
    actorUserId: string | null;
    surface: string;
    scan: JailbreakScan;
    now?: Date;
  },
): Promise<RecordOutcome> {
  const base = { recorded: false, deduped: false, alerted: 0, emailed: 0, emailThrottled: false };
  if (!args.scan.flagged || !args.scan.signature || !args.orgId) return base;

  const event = buildSecurityEvent(args);
  try {
    if (await store.hasEvent(event.fingerprint)) {
      return { ...base, deduped: true };
    }
  } catch {
    // A failed dedupe read must not lose the signal — fall through and insert.
  }

  let eventId: string | null = null;
  try {
    eventId = await store.insertEvent(event);
  } catch {
    return base;
  }

  if (!isElevated(args.scan)) {
    return { ...base, recorded: true };
  }

  let alerts: AdminAlert[] = [];
  try {
    const admins = await store.listAdmins(args.orgId);
    alerts = buildAdminAlerts({ event, eventId, adminUserIds: admins, scan: args.scan });
    if (alerts.length) await store.insertNotifications(alerts);
  } catch {
    return { ...base, recorded: true };
  }

  // Throttle the email fanout — the in-app item above is already recorded, so
  // nothing is lost when we go quiet; the daily digest sweeps up the rest.
  let throttled = false;
  if (alerts.length && store.countEmailedToday) {
    try {
      const already = await store.countEmailedToday(args.orgId, easternDay(args.now));
      throttled = already >= ELEVATED_EMAIL_DAILY_CAP;
    } catch {
      throttled = false;
    }
  }

  let emailed = 0;
  if (alerts.length && !throttled && store.sendEmails) {
    try {
      await store.sendEmails(alerts);
      emailed = alerts.length;
      if (eventId && store.markEmailed) await store.markEmailed(eventId);
    } catch {
      emailed = 0;
    }
  }
  return {
    recorded: true,
    deduped: false,
    alerted: alerts.length,
    emailed,
    emailThrottled: throttled,
  };
}


/** What the AI says back. Polite, ordinary — it never mentions the flag. */
export const JAILBREAK_REFUSAL =
  "That's not something I can help with. Happy to help with anything about this office's work — schedules, policies, training, or your own records.";
