import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = "Purple Envelope";
const FROM_DOMAIN = "purpleenvelope.app";
const SENDER_DOMAIN = "notify.purpleenvelope.app";
const APP_URL = "https://purpleenvelope.app/training";

/** Days before the due date that earn a nudge, plus the day-of and overdue passes. */
const LEAD_DAYS = [3, 1, 0];

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

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prettyDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${isoDate}T12:00:00Z`));
}

function copyFor(title: string, dueDate: string, daysLeft: number) {
  const when = prettyDate(dueDate);
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return {
      heading: "Training is overdue",
      subject: `Overdue: ${title}`,
      line: `"${title}" was due ${when} — ${n} day${n === 1 ? "" : "s"} ago. It only takes a few minutes to finish.`,
    };
  }
  if (daysLeft === 0) {
    return {
      heading: "Training is due today",
      subject: `Due today: ${title}`,
      line: `"${title}" is due today (${when}). A few minutes now keeps it off your overdue list.`,
    };
  }
  return {
    heading: "Training coming up",
    subject: `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: ${title}`,
    line: `"${title}" is due ${when} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} away. Good time to knock it out.`,
  };
}

function emailHtml(heading: string, line: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
      <div style="background:#53406e;border-radius:12px 12px 0 0;padding:24px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.02em;">Purple Envelope</div>
        <div style="color:#d9d2e6;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">Practice Operations</div>
      </div>
      <div style="background:#ffffff;border:1px solid #e6e2ec;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#1d1830;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4a4458;">${escapeHtml(line)}</p>
        <a href="${APP_URL}" style="display:inline-block;background:#53406e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">Open my training</a>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#9a94a8;text-align:center;">Practice guidance, not patient records.</p>
    </div>
  </body>
</html>`;
}

/**
 * Scheduled nudges for training assignments: 3 days out, 1 day out, on the due
 * date, and a weekly-ish poke while overdue. Invoked by pg_cron with the
 * service-role key; at most one reminder per assignment per Eastern day.
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

    const { data: assignments, error: aErr } = await admin
      .from("training_assignments")
      .select("id, org_id, module_id, assigned_to, due_date, status")
      .in("status", ["assigned", "in_progress"])
      .not("due_date", "is", null)
      .lte("due_date", addDays(today, Math.max(...LEAD_DAYS)));

    if (aErr) throw new Error(aErr.message);

    // Which stages are due a nudge today: the lead days, plus overdue every 3rd day.
    const candidates = (assignments ?? []).filter((a) => {
      const daysLeft = Math.round(
        (Date.parse(`${a.due_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000,
      );
      if (daysLeft >= 0) return LEAD_DAYS.includes(daysLeft);
      return Math.abs(daysLeft) % 3 === 0 && Math.abs(daysLeft) <= 30;
    });

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ checked: assignments?.length ?? 0, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip anything already nudged today (safe to re-run the job).
    const { data: sentToday } = await admin
      .from("notifications")
      .select("related_id")
      .eq("notification_type", "training_due")
      .in("related_id", candidates.map((c) => c.id))
      .gte("created_at", `${today}T00:00:00Z`);
    const alreadySent = new Set((sentToday ?? []).map((n) => n.related_id));

    const pending = candidates.filter((c) => !alreadySent.has(c.id));
    if (pending.length === 0) {
      return new Response(JSON.stringify({ checked: candidates.length, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: modules } = await admin
      .from("training_modules")
      .select("id, title, status")
      .in("id", [...new Set(pending.map((p) => p.module_id))]);
    const moduleById = new Map((modules ?? []).map((m) => [m.id, m]));

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", [...new Set(pending.map((p) => p.assigned_to))]);
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    let sent = 0;

    for (const a of pending) {
      const mod = moduleById.get(a.module_id);
      // Don't chase people about archived modules.
      if (!mod || mod.status !== "published") continue;

      const daysLeft = Math.round(
        (Date.parse(`${a.due_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000,
      );
      const { heading, subject, line } = copyFor(mod.title, a.due_date, daysLeft);

      const { error: notifError } = await admin.from("notifications").insert({
        org_id: a.org_id,
        recipient_user_id: a.assigned_to,
        notification_type: "training_due",
        title: heading,
        message: line,
        related_table: "training_assignments",
        related_id: a.id,
      });
      if (notifError) {
        console.error("Training reminder notification failed", {
          assignment: a.id,
          error: notifError.message,
        });
        continue;
      }
      sent += 1;

      const profile = profileById.get(a.assigned_to);
      if (!profile?.email) continue;

      const messageId = crypto.randomUUID();
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "training_due",
        recipient_email: profile.email,
        status: "pending",
      });

      let unsubscribeToken = crypto.randomUUID();
      const { data: existingToken } = await admin
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", profile.email)
        .maybeSingle();
      if (existingToken?.token) {
        unsubscribeToken = existingToken.token;
      } else {
        const { data: created } = await admin
          .from("email_unsubscribe_tokens")
          .insert({ email: profile.email, token: unsubscribeToken })
          .select("token")
          .maybeSingle();
        if (created?.token) unsubscribeToken = created.token;
      }

      const { error: enqueueError } = await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          idempotency_key: `training-due-${a.id}-${today}`,
          message_id: messageId,
          to: profile.email,
          from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html: emailHtml(heading, line),
          text: `${line}\n\n${APP_URL}`,
          purpose: "transactional",
          label: "training_due",
          unsubscribe_token: unsubscribeToken,
          queued_at: new Date().toISOString(),
        },
      });

      if (enqueueError) {
        console.error("Failed to enqueue training reminder email", {
          error: enqueueError.message,
          email: maskEmail(profile.email),
        });
        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "training_due",
          recipient_email: profile.email,
          status: "failed",
          error_message: "Failed to enqueue email",
        });
      }
    }

    console.log("Training reminders run complete", { candidates: candidates.length, sent });

    return new Response(JSON.stringify({ checked: candidates.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("training-reminders failed", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ error: "Reminder run failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
