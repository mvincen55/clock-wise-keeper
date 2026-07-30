// JAILBREAK GUARD — the shared detector every AI surface runs its input through.
//
// It matches ATTACK SIGNATURES, not meaning. What gets written to
// security_events is the pattern that matched, the surface, and the actor —
// never the text the person typed, never a snippet, never a hash of content.
// Message and conversation content is off limits; the secrecy promise is
// absolute, and this file is where that promise is kept.
//
// Fail-open by design: if the detector or the log write throws, the person's
// work continues. A missed flag is acceptable; a blocked colleague is not.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type JailbreakSignature =
  | "instruction_override"
  | "system_prompt_extraction"
  | "role_impersonation"
  | "policy_override"
  | "other_employee_data"
  | "patient_data_injection";

interface SignatureRule {
  signature: JailbreakSignature;
  /** Plain-English description of the pattern — safe to store and display. */
  label: string;
  severity: "watch" | "elevated";
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
  severity?: "watch" | "elevated";
}

/**
 * Scan text for attack signatures. Returns only the matched pattern's identity
 * — the caller never receives, and must never store, the scanned text.
 */
export function scanForJailbreak(input: unknown): JailbreakScan {
  const text = typeof input === "string" ? input : "";
  if (!text || text.length > 20_000) return { flagged: false };
  for (const rule of RULES) {
    if (rule.patterns.some(p => p.test(text))) {
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

/** Scan the newest user turn of a chat array. Earlier turns are already scanned. */
export function scanLatestUserTurn(
  messages: unknown,
): JailbreakScan {
  if (!Array.isArray(messages)) return { flagged: false };
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; content?: string } | null;
    if (m && m.role === "user") return scanForJailbreak(m.content);
  }
  return { flagged: false };
}

/** One event per actor + surface + signature per Eastern day — no re-reporting. */
function fingerprintFor(orgId: string, actorId: string | null, surface: string, sig: string): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `ai_jailbreak:${orgId}:${actorId ?? "anon"}:${surface}:${sig}:${day}`;
}

/**
 * Record the signature. Service-role write — member clients can never insert
 * here, and the actor can never read their own event (no tip-offs).
 */
export async function logJailbreakSignature(args: {
  orgId: string;
  actorUserId: string | null;
  surface: string;
  scan: JailbreakScan;
}): Promise<void> {
  const { orgId, actorUserId, surface, scan } = args;
  if (!scan.flagged || !scan.signature || !orgId) return;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const fingerprint = fingerprintFor(orgId, actorUserId, surface, scan.signature);

    // Don't re-open a signature that's already open or dismissed today.
    const { data: existing } = await admin
      .from("security_events")
      .select("id")
      .eq("fingerprint", fingerprint)
      .in("status", ["open", "dismissed"])
      .limit(1)
      .maybeSingle();
    if (existing) return;

    await admin.from("security_events").insert({
      org_id: orgId,
      actor_user_id: actorUserId,
      kind: "ai_jailbreak",
      severity: scan.severity ?? "watch",
      status: "open",
      fingerprint,
      // Signature only. No prompt text, no snippet, no content hash.
      detail: {
        surface,
        signature: scan.signature,
        pattern: scan.label,
        note: "Signature match only — no conversation content is stored or scanned.",
      },
    });
  } catch (err) {
    // Fail open: detection never blocks a person's work.
    console.error("jailbreak-guard: log failed", (err as Error)?.message);
  }
}

/** What the AI says back. Polite, ordinary — it never mentions the flag. */
export const JAILBREAK_REFUSAL =
  "That's not something I can help with. Happy to help with anything about this office's work — schedules, policies, training, or your own records.";

/**
 * Scan + log in one call. Returns true when the caller should refuse.
 * The caller refuses politely and says nothing about the flag.
 */
export async function guardAiInput(args: {
  orgId: string | null | undefined;
  actorUserId: string | null;
  surface: string;
  input: unknown;
  /** Set when `input` is a chat message array rather than a plain string. */
  isMessageArray?: boolean;
}): Promise<boolean> {
  try {
    const scan = args.isMessageArray
      ? scanLatestUserTurn(args.input)
      : scanForJailbreak(args.input);
    if (!scan.flagged) return false;
    if (args.orgId) {
      await logJailbreakSignature({
        orgId: args.orgId,
        actorUserId: args.actorUserId,
        surface: args.surface,
        scan,
      });
    }
    return true;
  } catch (err) {
    console.error("jailbreak-guard: scan failed", (err as Error)?.message);
    return false;
  }
}
