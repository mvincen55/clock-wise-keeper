// JAILBREAK GUARD — the Supabase-backed adapter every AI surface calls.
//
// All detection and recording rules live in ./integrity-signatures.ts, which is
// pure and unit-tested. This file only supplies the store: service-role writes
// to security_events and notifications.
//
// The promise this keeps: signature only. No prompt text, no snippet, no hash
// of anything a person typed ever leaves this boundary.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  type AdminAlert,
  type IntegrityStore,
  JAILBREAK_REFUSAL,
  type JailbreakScan,
  recordJailbreakSignature,
  scanForJailbreak,
  scanLatestUserTurn,
  type SecurityEventRow,
} from "./integrity-signatures.ts";

export {
  JAILBREAK_REFUSAL,
  scanForJailbreak,
  scanLatestUserTurn,
};
export type { JailbreakScan };

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Service-role store. Member clients can never write here themselves. */
export function supabaseIntegrityStore(): IntegrityStore {
  const db = admin();
  return {
    async hasEvent(fingerprint: string) {
      const { data } = await db
        .from("security_events")
        .select("id")
        .eq("fingerprint", fingerprint)
        .in("status", ["open", "dismissed"])
        .limit(1)
        .maybeSingle();
      return Boolean(data);
    },
    async insertEvent(row: SecurityEventRow) {
      const { data, error } = await db
        .from("security_events")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      return (data?.id as string) ?? null;
    },
    async listAdmins(orgId: string) {
      const { data } = await db
        .from("org_members")
        .select("user_id, role")
        .eq("org_id", orgId)
        .eq("status", "active")
        .in("role", ["owner", "manager"]);
      return (data ?? []).map((m: { user_id: string }) => m.user_id);
    },
    async insertNotifications(rows: AdminAlert[]) {
      const { error } = await db.from("notifications").insert(rows);
      if (error) throw error;
    },
    async sendEmails(rows: AdminAlert[]) {
      // Best-effort: the queue exists only when email infra is set up.
      for (const r of rows) {
        await db.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            purpose: "transactional",
            template: "integrity_elevated",
            recipient_user_id: r.recipient_user_id,
            org_id: r.org_id,
            subject: r.title,
            body: r.message,
            idempotency_key: `integrity:${r.related_id ?? r.recipient_user_id}:${r.recipient_user_id}`,
          },
        });
      }
    },
    async countEmailedToday(orgId: string, _day: string) {
      // Rolling 24h window — close enough to "today" for a cap, and immune to
      // the Eastern/UTC midnight seam.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from("security_events")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("severity", "elevated")
        .eq("detail->>alert_emailed", "true")
        .gte("created_at", since);
      return count ?? 0;
    },
    async markEmailed(eventId: string) {
      const { data } = await db
        .from("security_events")
        .select("detail")
        .eq("id", eventId)
        .maybeSingle();
      const detail = (data?.detail as Record<string, unknown>) ?? {};
      await db
        .from("security_events")
        .update({ detail: { ...detail, alert_emailed: true } })
        .eq("id", eventId);
    },
  };
}


/**
 * Scan + record in one call. Returns true when the caller should refuse.
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
      await recordJailbreakSignature(supabaseIntegrityStore(), {
        orgId: args.orgId,
        actorUserId: args.actorUserId,
        surface: args.surface,
        scan,
      });
    }
    return true;
  } catch (err) {
    // Fail open: detection never blocks a person's work.
    console.error("jailbreak-guard: failed", (err as Error)?.message);
    return false;
  }
}
