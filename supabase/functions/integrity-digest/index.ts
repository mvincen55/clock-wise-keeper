// INTEGRITY DIGEST — one quiet daily summary of open integrity signals.
//
// Elevated signals are throttled at the source (see _shared/jailbreak-guard.ts)
// so a burst can't flood inboxes. This job is the other half of that deal: once
// a day, each org's owners get a single email listing what's still open —
// including anything the throttle held back.
//
// Same promise as the detector: signature counts only. No conversation content,
// no snippets, no names of what anyone typed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = "Purple Envelope";
const FROM_DOMAIN = "purpleenvelope.app";
const SENDER_DOMAIN = "notify.purpleenvelope.app";
const APP_URL = "https://purpleenvelope.app/settings";

function easternToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function maskEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) return "<invalid>";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Line {
  label: string;
  count: number;
  elevated: boolean;
}

function emailHtml(lines: Line[], openTotal: number): string {
  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;font-size:14px;color:#4a4458;">${escapeHtml(l.label)}</td>` +
        `<td style="padding:8px 0;text-align:right;font-size:14px;font-weight:600;color:${
          l.elevated ? "#8a2f3b" : "#53406e"
        };">${l.count}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
      <div style="background:#53406e;border-radius:12px 12px 0 0;padding:24px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.02em;">${SITE_NAME}</div>
        <div style="color:#d9d2e6;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">Integrity &amp; Safety</div>
      </div>
      <div style="background:#ffffff;border:1px solid #e6e2ec;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
        <h1 style="margin:0 0 8px;font-size:20px;color:#1d1830;">Daily integrity digest</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4a4458;">
          ${openTotal} open item${openTotal === 1 ? "" : "s"} waiting for review. These are pattern matches only —
          no conversation content was read or stored.
        </p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid #eeebf2;">${rows}</table>
        <a href="${APP_URL}" style="display:inline-block;margin-top:24px;background:#53406e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">Review in Integrity &amp; Safety</a>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#9a94a8;text-align:center;">Only your business, never your patients.</p>
    </div>
  </body>
</html>`;
}

/**
 * Daily owners digest. Invoked by pg_cron with the service-role key; at most
 * one digest per owner per Eastern day, and nothing sent when nothing is open.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!bearer || bearer !== serviceKey) {
    return new Response(JSON.stringify({ error: "Not authorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const today = easternToday();

    const { data: events, error: eErr } = await admin
      .from("security_events")
      .select("id, org_id, severity, detail, created_at")
      .eq("status", "open");
    if (eErr) throw new Error(eErr.message);

    const byOrg = new Map<string, typeof events>();
    for (const ev of events ?? []) {
      const list = byOrg.get(ev.org_id) ?? [];
      list.push(ev);
      byOrg.set(ev.org_id, list as typeof events);
    }

    let digests = 0;

    for (const [orgId, orgEvents] of byOrg) {
      if (!orgEvents?.length) continue;

      // Group by the human-readable pattern label — counts, never content.
      const counts = new Map<string, Line>();
      for (const ev of orgEvents) {
        const detail = (ev.detail ?? {}) as Record<string, unknown>;
        const label = String(detail.pattern ?? detail.signature ?? "Unclassified signal");
        const existing = counts.get(label);
        if (existing) {
          existing.count += 1;
          existing.elevated = existing.elevated || ev.severity === "elevated";
        } else {
          counts.set(label, { label, count: 1, elevated: ev.severity === "elevated" });
        }
      }
      const lines = [...counts.values()].sort(
        (a, b) => Number(b.elevated) - Number(a.elevated) || b.count - a.count,
      );
      const openTotal = orgEvents.length;
      const summary = lines
        .slice(0, 3)
        .map((l) => `${l.label} (${l.count})`)
        .join("; ");

      const { data: owners } = await admin
        .from("org_members")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("status", "active")
        .eq("role", "owner");
      const ownerIds = [...new Set((owners ?? []).map((o) => o.user_id))];
      if (!ownerIds.length) continue;

      // One digest per owner per Eastern day, so re-runs stay quiet.
      const { data: sentToday } = await admin
        .from("notifications")
        .select("recipient_user_id")
        .eq("org_id", orgId)
        .eq("notification_type", "integrity_digest")
        .in("recipient_user_id", ownerIds)
        .gte("created_at", `${today}T00:00:00Z`);
      const already = new Set((sentToday ?? []).map((n) => n.recipient_user_id));
      const pending = ownerIds.filter((id) => !already.has(id));
      if (!pending.length) continue;

      const title = `Integrity digest — ${openTotal} open item${openTotal === 1 ? "" : "s"}`;
      const message = `${summary || "Open integrity signals"}. Signature counts only; no conversation content was read or stored. Review in Settings → Integrity & Safety.`;

      const { error: notifErr } = await admin.from("notifications").insert(
        pending.map((id) => ({
          org_id: orgId,
          recipient_user_id: id,
          actor_user_id: null,
          notification_type: "integrity_digest",
          title,
          message,
          related_table: "security_events",
          related_id: null,
        })),
      );
      if (notifErr) {
        console.error("Integrity digest notification failed", { orgId, error: notifErr.message });
        continue;
      }
      digests += pending.length;

      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", pending);

      for (const p of profiles ?? []) {
        if (!p.email) continue;

        const messageId = crypto.randomUUID();
        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "integrity_digest",
          recipient_email: p.email,
          status: "pending",
        });

        let unsubscribeToken = crypto.randomUUID();
        const { data: existingToken } = await admin
          .from("email_unsubscribe_tokens")
          .select("token")
          .eq("email", p.email)
          .maybeSingle();
        if (existingToken?.token) {
          unsubscribeToken = existingToken.token;
        } else {
          const { data: created } = await admin
            .from("email_unsubscribe_tokens")
            .insert({ email: p.email, token: unsubscribeToken })
            .select("token")
            .maybeSingle();
          if (created?.token) unsubscribeToken = created.token;
        }

        const { error: enqueueError } = await admin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            idempotency_key: `integrity-digest-${orgId}-${p.id}-${today}`,
            message_id: messageId,
            to: p.email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: title,
            html: emailHtml(lines, openTotal),
            text: `${message}\n\n${APP_URL}`,
            purpose: "transactional",
            label: "integrity_digest",
            unsubscribe_token: unsubscribeToken,
            queued_at: new Date().toISOString(),
          },
        });

        if (enqueueError) {
          console.error("Failed to enqueue integrity digest", {
            error: enqueueError.message,
            email: maskEmail(p.email),
          });
          await admin.from("email_send_log").insert({
            message_id: messageId,
            template_name: "integrity_digest",
            recipient_email: p.email,
            status: "failed",
            error_message: "Failed to enqueue email",
          });
        }
      }
    }

    console.log("Integrity digest run complete", { orgs: byOrg.size, digests });

    return new Response(JSON.stringify({ orgs: byOrg.size, digests }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("integrity-digest failed", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "Digest run failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
