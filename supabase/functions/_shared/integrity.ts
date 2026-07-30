// Integrity & Safety — the system watching its own behavior.
//
// THE BOUNDARY (enforced here, stated in the UI):
//   This layer NEVER records message content, AI conversation text, or any
//   patient data. What it records is an attack SIGNATURE (the pattern that
//   matched), a record-level anomaly, or a tamper signal. Private messages
//   and the AI channel are never scanned for "suspicious meaning".
//
// Everything in here FAILS OPEN: if logging breaks, the caller's real work
// still succeeds. Nothing in this module ever throws to its caller.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SecurityEventKind =
  | "auth_abuse"
  | "function_abuse"
  | "ai_jailbreak"
  | "time_anomaly"
  | "deposit_discrepancy"
  | "destructive_action";

export type Severity = "watch" | "elevated";

const SITE_NAME = "Purple Envelope";
const FROM_DOMAIN = "purpleenvelope.app";
const SENDER_DOMAIN = "notify.purpleenvelope.app";

/** Stable key so the same pattern is not re-reported while it is still open. */
export function fingerprint(parts: string[]): string {
  const joined = parts.join("|").toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < joined.length; i++) {
    const c = joined.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

export function maskEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) return "***";
  const [name, domain] = email.split("@");
  const head = name.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// ---------------------------------------------------------------------------
// Prompt-injection / jailbreak signatures
// ---------------------------------------------------------------------------
//
// Each entry is a NAMED signature. Only the name is ever stored — never the
// text the person typed.

const SIGNATURES: { id: string; label: string; re: RegExp }[] = [
  {
    id: "instruction_override",
    label: "Tried to override the assistant's instructions",
    re: /\b(ignore|disregard|forget|override)\b[^.]{0,40}\b(previous|prior|earlier|above|all)\b[^.]{0,20}\b(instruction|prompt|rule|direction)/i,
  },
  {
    id: "system_prompt_exfil",
    label: "Asked the assistant to reveal its system prompt",
    re: /\b(system prompt|your instructions|initial prompt|developer message|repeat everything above|print your prompt)\b/i,
  },
  {
    id: "role_escape",
    label: "Tried to reassign the assistant's role or safety rules",
    re: /\b(you are now|act as|pretend to be|jailbreak|DAN mode|developer mode|no restrictions|without any rules)\b/i,
  },
  {
    id: "other_employee_data",
    label: "Asked for another employee's private records",
    re: /\b(everyone'?s|other (employees?|staff|team member)'?s?|all (employees?|staff|users?))\b[^.]{0,50}\b(pay|wage|salary|punch|goal|message|password|note|attendance|review)/i,
  },
  {
    id: "private_messages_request",
    label: "Asked to read private messages or the AI channel",
    re: /\b(read|show|dump|access)\b[^.]{0,30}\b(private|dm|direct)\b[^.]{0,20}\b(message|conversation|chat)/i,
  },
  {
    id: "patient_data_injection",
    label: "Tried to put patient-identifying data into the assistant",
    re: /\b(patient(?:'|’)?s? (name|dob|date of birth|ssn|chart|record|phone|address|insurance id)|mrn\b|social security)/i,
  },
  {
    id: "office_rule_override",
    label: "Tried to make the assistant contradict office rules",
    re: /\b(ignore|bypass|override|don'?t follow|do not follow)\b[^.]{0,40}\b(office (rule|policy|memor(y|ies))|practice (rule|policy)|policy manual)\b/i,
  },
  {
    id: "credential_probe",
    label: "Probed for keys, tokens, or credentials",
    re: /\b(service[_ ]?role|api[_ ]?key|secret key|access token|env(ironment)? variable|supabase (url|key))\b/i,
  },
];

/** Returns the matched signature ids, or [] when nothing suspicious matched. */
export function detectInjection(...inputs: (string | null | undefined)[]): string[] {
  const text = inputs.filter(Boolean).join("\n").slice(0, 8000);
  if (!text.trim()) return [];
  return SIGNATURES.filter((s) => s.re.test(text)).map((s) => s.id);
}

export function signatureLabels(ids: string[]): string[] {
  return ids.map((id) => SIGNATURES.find((s) => s.id === id)?.label ?? id);
}

/** The polite refusal the assistant returns. It never mentions the flag. */
export const REFUSAL =
  "I can't help with that one. I can work with your own goals, training, schedule, and the office's own rules — ask me anything in that lane and I'm all yours.";

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export interface SecurityEventInput {
  orgId: string;
  kind: SecurityEventKind;
  /** Never the person's words — a signature id, counter, or record id only. */
  detail: Record<string, unknown>;
  severity?: Severity;
  actorUserId?: string | null;
  /** Extra parts that make this occurrence distinct from another. */
  fingerprintParts: string[];
  /** One-line human summary shown to owners/managers. */
  summary: string;
}

/**
 * Writes a security event (service role), deduped by fingerprint while the
 * event is still open or dismissed, and escalates 'elevated' events to the
 * owners. Never throws.
 */
export async function logSecurityEvent(
  admin: SupabaseClient,
  input: SecurityEventInput,
): Promise<void> {
  try {
    const severity: Severity = input.severity ?? "watch";
    const fp = fingerprint([input.kind, input.orgId, ...input.fingerprintParts]);

    const { data: inserted, error } = await admin
      .from("security_events")
      .insert({
        org_id: input.orgId,
        actor_user_id: input.actorUserId ?? null,
        kind: input.kind,
        severity,
        detail: { ...input.detail, summary: input.summary },
        fingerprint: fp,
      })
      .select("id")
      .maybeSingle();

    // Unique-violation = already reported and still open/dismissed. Nothing to do.
    if (error || !inserted) return;
    if (severity !== "elevated") return;

    await escalate(admin, input, inserted.id);
  } catch (err) {
    console.error("integrity: failed to record event", err);
  }
}

async function escalate(
  admin: SupabaseClient,
  input: SecurityEventInput,
  eventId: string,
): Promise<void> {
  try {
    const { data: settings } = await admin
      .from("org_practice_settings")
      .select("security_alert_managers")
      .eq("org_id", input.orgId)
      .maybeSingle();
    const includeManagers = settings?.security_alert_managers === true;

    const roles = includeManagers ? ["owner", "manager"] : ["owner"];
    const { data: admins } = await admin
      .from("org_members")
      .select("user_id, role")
      .eq("org_id", input.orgId)
      .eq("status", "active")
      .in("role", roles);

    // The actor never gets tipped off about an event about themselves.
    const recipients = (admins ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id && id !== input.actorUserId);
    if (!recipients.length) return;

    await admin.from("notifications").insert(
      recipients.map((rid) => ({
        org_id: input.orgId,
        recipient_user_id: rid,
        notification_type: "security_event",
        title: "Integrity alert",
        message: input.summary,
        related_table: "security_events",
        related_id: eventId,
      })),
    );

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", recipients);

    for (const profile of profiles ?? []) {
      const email = (profile as { email?: string }).email;
      if (!email) continue;
      await queueAlertEmail(admin, email, input.summary, input.kind);
    }
  } catch (err) {
    console.error("integrity: escalation failed", err);
  }
}

async function queueAlertEmail(
  admin: SupabaseClient,
  email: string,
  summary: string,
  kind: string,
): Promise<void> {
  try {
    const messageId = crypto.randomUUID();
    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "security_alert",
      recipient_email: email,
      status: "pending",
    });

    let unsubscribeToken = crypto.randomUUID();
    const { data: existing } = await admin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", email)
      .maybeSingle();
    if (existing?.token) {
      unsubscribeToken = existing.token as string;
    } else {
      const { data: created } = await admin
        .from("email_unsubscribe_tokens")
        .insert({ email, token: unsubscribeToken })
        .select("token")
        .maybeSingle();
      if (created?.token) unsubscribeToken = created.token as string;
    }

    const safeSummary = summary.replace(/[<>]/g, "");
    const { error } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        idempotency_key: `security-alert-${messageId}`,
        message_id: messageId,
        to: email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: "Integrity alert — Purple Envelope",
        html:
          `<div style="font-family:Arial,sans-serif;color:#222"><h2 style="color:#53406e">Integrity alert</h2>` +
          `<p>${safeSummary}</p><p style="color:#666;font-size:13px">Signal type: ${kind}. ` +
          `Review it under Settings → Integrity &amp; Safety.</p>` +
          `<p style="color:#666;font-size:12px">Purple Envelope monitors system security and data-integrity events. It never reads your messages.</p></div>`,
        text: `Integrity alert\n\n${safeSummary}\n\nSignal type: ${kind}. Review it under Settings > Integrity & Safety.\n\nPurple Envelope monitors system security and data-integrity events. It never reads your messages.`,
        purpose: "transactional",
        label: "security_alert",
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });
    if (error) {
      console.error("integrity: alert email enqueue failed", {
        error,
        email: maskEmail(email),
      });
    }
  } catch (err) {
    console.error("integrity: alert email failed", err);
  }
}

/**
 * Convenience wrapper for the AI surfaces: detect, log, and tell the caller
 * whether to refuse. Never throws; on any internal failure it returns false
 * (fail open — the assistant answers normally).
 */
export async function guardAiInput(opts: {
  orgId: string | null | undefined;
  userId: string | null | undefined;
  surface: string;
  inputs: (string | null | undefined)[];
}): Promise<boolean> {
  try {
    const matched = detectInjection(...opts.inputs);
    if (!matched.length) return false;
    if (!opts.orgId) return true;

    const admin = adminClient();
    await logSecurityEvent(admin, {
      orgId: opts.orgId,
      actorUserId: opts.userId ?? null,
      kind: "ai_jailbreak",
      severity: matched.length > 1 ? "elevated" : "watch",
      detail: {
        surface: opts.surface,
        signatures: matched,
        signature_labels: signatureLabels(matched),
        note: "Attack signature only — no conversation content is stored.",
      },
      fingerprintParts: [opts.surface, opts.userId ?? "anon", matched.sort().join(",")],
      summary: `AI misuse attempt on ${opts.surface}: ${signatureLabels(matched).join("; ")}`,
    });
    return true;
  } catch (err) {
    console.error("integrity: guardAiInput failed open", err);
    return false;
  }
}
