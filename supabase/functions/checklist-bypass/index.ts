import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { computeGating, audiencesFor } from "../_shared/checklist-gating.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = "Purple Envelope";
const FROM_DOMAIN = "purpleenvelope.app";
const SENDER_DOMAIN = "notify.purpleenvelope.app";

// Recipient addresses are PII: keep them out of function logs.
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

/** Eastern-local day, matching src/lib/time-utils getToday(). */
function easternToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function bodyLines(name: string, date: string, count: number, reason: string | null, level: number) {
  const first = `${name} bypassed their checklist on ${date} with ${count} item${count === 1 ? "" : "s"} incomplete. Reason: ${reason && reason.trim() ? reason.trim() : "not given yet"}.`;
  const escalation =
    level > 1
      ? `This is their ${ordinal(level)} clock-out with an unanswered checklist bypass. It needs an answer.`
      : null;
  return { first, escalation };
}

function emailHtml(first: string, escalation: string | null): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
      <div style="background:#53406e;border-radius:12px 12px 0 0;padding:24px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.02em;">Purple Envelope</div>
        <div style="color:#d9d2e6;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">Practice Operations</div>
      </div>
      <div style="background:#ffffff;border:1px solid #e6e2ec;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#1d1830;">Checklist bypass</h1>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#4a4458;">${escapeHtml(first)}</p>
        ${escalation ? `<p style="margin:0;font-size:15px;line-height:1.6;color:#6b3a2a;"><strong>${escapeHtml(escalation)}</strong></p>` : ""}
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#9a94a8;text-align:center;">Only your business, never your patients.</p>
    </div>
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reason: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.reason === "string" && body.reason.trim()) {
        reason = body.reason.trim().slice(0, 2000);
      }
    } catch (_) {
      // no body is fine
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await asUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: membership } = await admin
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "No active membership" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = membership.org_id as string;
    const isAdmin = membership.role === "owner" || membership.role === "manager";

    const { data: employee } = await admin
      .from("employees")
      .select("id, display_name")
      .eq("user_id", user.id)
      .eq("org_id", orgId)
      .limit(1)
      .maybeSingle();

    if (!employee) {
      return new Response(JSON.stringify({ error: "No employee record" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = easternToday();

    // Owners are never in the clock/closeout flow — of the three membership
    // types (Owner, Manager, Team) they're the only ones who don't punch, so
    // there's nothing to bypass and nothing is recorded.
    if (membership.role === "owner") {
      return new Response(JSON.stringify({ ok: true, gated: false, items: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Re-verify gating items server-side — never trust the client count.
    //    Mirrors src/hooks/useChecklistGating: a personal item only counts for
    //    the person it belongs to, dated items only once their day has come,
    //    and a dated item completes against its own day, not today.
    const { data: lists } = await admin
      .from("checklists")
      .select("id, audience")
      .eq("org_id", orgId)
      .in("audience", audiencesFor(isAdmin));

    const listIds = (lists ?? []).map((l) => l.id);
    let incompleteCount = 0;
    if (listIds.length) {
      const { data: items } = await admin
        .from("checklist_items")
        .select("id, title, per_person, owner_user_id, due_date, checklist_id")
        .eq("org_id", orgId)
        .in("checklist_id", listIds)
        .eq("cadence", "daily")
        .eq("is_active", true);

      const { data: done } = await admin
        .from("checklist_completions")
        .select("item_id, completed_by, period_key")
        .in("item_id", (items ?? []).map((i) => i.id));

      // Same pure rule the client runs — see _shared/checklist-gating.ts.
      incompleteCount = computeGating({
        lists: (lists ?? []).map((l) => ({ id: l.id as string, audience: l.audience as string })),
        items: (items ?? []).map((i) => ({
          id: i.id as string,
          title: (i.title as string) ?? "",
          per_person: !!i.per_person,
          owner_user_id: (i.owner_user_id as string | null) ?? null,
          due_date: (i.due_date as string | null) ?? null,
          checklist_id: i.checklist_id as string,
        })),
        completions: done ?? [],
        userId: user.id,
        today,
        isAdmin,
      }).incompleteCount;
    }

    if (incompleteCount === 0) {
      return new Response(JSON.stringify({ recorded: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Escalation level from prior unresolved days, then idempotent insert.
    const { count: priorUnresolved } = await admin
      .from("checklist_bypasses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("resolved", false)
      .lt("checklist_date", today);

    const escalationLevel = 1 + (priorUnresolved ?? 0);

    const { data: inserted, error: insertError } = await admin
      .from("checklist_bypasses")
      .insert({
        org_id: orgId,
        user_id: user.id,
        employee_id: employee.id,
        checklist_date: today,
        incomplete_count: incompleteCount,
        escalation_level: escalationLevel,
        reason,
        reason_submitted_at: reason ? new Date().toISOString() : null,
      })
      .select("id, escalation_level")
      .maybeSingle();

    // A real failure is not a duplicate: only the idempotent unique-violation
    // (user_id + checklist_date) may be swallowed. Anything else is an error —
    // the client still writes the punch, so nobody is trapped at the office.
    if (insertError && insertError.code !== "23505") {
      console.error("checklist bypass insert failed", insertError.code);
      return new Response(JSON.stringify({ error: "Could not record the bypass" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already recorded today: stay quiet.
    if (!inserted) {
      const { data: existing } = await admin
        .from("checklist_bypasses")
        .select("escalation_level")
        .eq("user_id", user.id)
        .eq("checklist_date", today)
        .maybeSingle();
      return new Response(
        JSON.stringify({ recorded: true, escalation_level: existing?.escalation_level ?? escalationLevel }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const memberName = employee.display_name || user.email || "A team member";
    const { first, escalation } = bodyLines(memberName, today, incompleteCount, reason, escalationLevel);

    // 3. Audit trail.
    await admin.from("audit_events").insert({
      user_id: user.id,
      org_id: orgId,
      employee_id: employee.id,
      actor_id: user.id,
      event_type: "checklist_bypass",
      event_details: {
        incomplete_count: incompleteCount,
        escalation_level: escalationLevel,
        reason_given: !!reason,
      },
      related_date: today,
    });

    // 4. Notify active owners and managers — in-app plus email.
    const { data: admins } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("status", "active")
      .in("role", ["owner", "manager"]);

    const recipients = (admins ?? []).map((a) => a.user_id).filter((id) => id !== user.id);

    if (recipients.length) {
      await admin.from("notifications").insert(
        recipients.map((rid) => ({
          org_id: orgId,
          recipient_user_id: rid,
          actor_user_id: user.id,
          notification_type: "checklist_bypass",
          title: escalationLevel > 1 ? "Checklist bypass — needs an answer" : "Checklist bypass",
          message: escalation ? `${first} ${escalation}` : first,
          related_table: "checklist_bypasses",
          related_id: inserted.id,
        })),
      );

      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", recipients);

      const subject =
        escalationLevel > 1
          ? `${memberName}'s checklist bypass still needs an answer`
          : `${memberName} bypassed their checklist`;

      for (const p of profiles ?? []) {
        if (!p.email) continue;
        const messageId = crypto.randomUUID();
        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "checklist_bypass",
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
            idempotency_key: `checklist-bypass-${messageId}`,
            message_id: messageId,
            to: p.email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html: emailHtml(first, escalation),
            text: escalation ? `${first}\n\n${escalation}` : first,
            purpose: "transactional",
            label: "checklist_bypass",
            unsubscribe_token: unsubscribeToken,
            queued_at: new Date().toISOString(),
          },
        });

        if (enqueueError) {
          console.error("Failed to enqueue checklist bypass email", {
            error: enqueueError.message,
            email: maskEmail(p.email),
          });
          await admin.from("email_send_log").insert({
            message_id: messageId,
            template_name: "checklist_bypass",
            recipient_email: p.email,
            status: "failed",
            error_message: "Failed to enqueue email",
          });
        } else {
          console.log("Checklist bypass email enqueued", { email: maskEmail(p.email) });
        }
      }
    }

    return new Response(JSON.stringify({ recorded: true, escalation_level: escalationLevel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("checklist-bypass error", { error: e?.message });
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
