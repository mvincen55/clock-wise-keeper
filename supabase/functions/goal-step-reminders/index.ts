import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Days out that earn a nudge, plus day-of. Overdue is handled separately. */
const LEAD_DAYS = [1, 0];
const GOAL_LIST_NAME = "My Goal Steps";
const SITE_NAME = "Purple Envelope";
const FROM_DOMAIN = "purpleenvelope.app";
const SENDER_DOMAIN = "notify.purpleenvelope.app";

/** Used when someone has not customized their reminder settings. */
const DEFAULT_PREF = { enabled: true, reminder_hour: 8, channel: "in_app" } as const;

/** Eastern-local hour (0-23) right now. */
function easternHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  ) % 24;
}

/** Queues one due-notice email through the shared email queue. */
// deno-lint-ignore no-explicit-any
async function enqueueReminderEmail(
  admin: any,
  to: string,
  heading: string,
  line: string,
  itemId: string,
  today: string,
): Promise<boolean> {
  const messageId = crypto.randomUUID();
  await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "goal_step_due",
    recipient_email: to,
    status: "pending",
  });

  let unsubscribeToken = crypto.randomUUID();
  const { data: existingToken } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", to)
    .maybeSingle();
  if (existingToken?.token) {
    unsubscribeToken = existingToken.token;
  } else {
    const { data: created } = await admin
      .from("email_unsubscribe_tokens")
      .insert({ email: to, token: unsubscribeToken })
      .select("token")
      .maybeSingle();
    if (created?.token) unsubscribeToken = created.token;
  }

  const { error } = await admin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      idempotency_key: `goal-step-${itemId}-${today}`,
      message_id: messageId,
      to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: heading,
      html:
        `<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${line}</p>`,
      text: line,
      purpose: "transactional",
      label: "goal_step_due",
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });
  if (error) {
    console.error("Failed to enqueue goal step reminder email", { itemId, error: error.message });
    return false;
  }
  return true;
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
      heading: "A goal step is still open",
      line: `"${title}" was due ${when} — ${n} day${n === 1 ? "" : "s"} ago. Finish it, or shrink it so it fits the week you actually have.`,
    };
  }
  if (daysLeft === 0) {
    return {
      heading: "Goal step due today",
      line: `"${title}" is due today (${when}). One step is all today asks for.`,
    };
  }
  return {
    heading: "Goal step due tomorrow",
    line: `"${title}" is due ${when}. Good time to line it up.`,
  };
}

/**
 * Scheduled in-app reminders for goal-driven checklist steps. Uses the step's
 * own owner (checklist_items.owner_user_id) and due date, skips anything already
 * checked off for the day, and posts at most one notification per step per
 * Eastern day. Invoked by pg_cron with the service-role key.
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

    // Goal steps live on each member's own "My Goal Steps" list.
    const { data: lists, error: lErr } = await admin
      .from("checklists")
      .select("id")
      .eq("name", GOAL_LIST_NAME);
    if (lErr) throw new Error(lErr.message);
    const listIds = (lists ?? []).map((l) => l.id);
    if (listIds.length === 0) {
      return new Response(JSON.stringify({ checked: 0, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: items, error: iErr } = await admin
      .from("checklist_items")
      .select("id, org_id, title, owner_user_id, due_date")
      .in("checklist_id", listIds)
      .eq("is_active", true)
      .not("owner_user_id", "is", null)
      .not("due_date", "is", null)
      .lte("due_date", addDays(today, Math.max(...LEAD_DAYS)));
    if (iErr) throw new Error(iErr.message);

    // Nudge on the lead days, then every 3rd day while overdue (up to 30 days).
    const candidates = (items ?? []).filter((i) => {
      const daysLeft = Math.round(
        (Date.parse(`${i.due_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000,
      );
      if (daysLeft >= 0) return LEAD_DAYS.includes(daysLeft);
      return Math.abs(daysLeft) % 3 === 0 && Math.abs(daysLeft) <= 30;
    });
    const hourNow = easternHour();

    // Every step we considered gets a line in the audit log, sent or skipped.
    type LogRow = Record<string, unknown>;
    const auditLog: LogRow[] = [];
    const daysLeftOf = (due: string) =>
      Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
    const note = (
      // deno-lint-ignore no-explicit-any
      item: any,
      outcome: string,
      reason: string | null,
      channel: string | null = null,
    ) => {
      auditLog.push({
        org_id: item.org_id ?? null,
        run_date: today,
        run_hour: hourNow,
        item_id: item.id,
        item_title: item.title,
        owner_user_id: item.owner_user_id,
        due_date: item.due_date,
        days_left: daysLeftOf(item.due_date),
        outcome,
        reason,
        channel,
      });
    };
    const flushLog = async () => {
      if (auditLog.length === 0) return;
      const { error } = await admin.from("goal_reminder_log").insert(auditLog);
      if (error) console.error("Could not write reminder log", error.message);
    };

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ checked: items?.length ?? 0, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ids = candidates.map((c) => c.id);

    // Already done today? Then there is nothing to chase.
    const { data: done } = await admin
      .from("checklist_completions")
      .select("item_id, completed_by, period_key")
      .in("item_id", ids)
      .eq("period_key", today);
    const doneBy = new Set((done ?? []).map((d) => `${d.item_id}:${d.completed_by}`));

    // Already nudged today? The job is safe to re-run.
    const { data: sentToday } = await admin
      .from("notifications")
      .select("related_id")
      .eq("notification_type", "goal_step_due")
      .in("related_id", ids)
      .gte("created_at", `${today}T00:00:00Z`);
    const alreadySent = new Set((sentToday ?? []).map((n) => n.related_id));

    // Per-person reminder settings: the hour they want it, and where it lands.
    const owners = [...new Set(candidates.map((c) => c.owner_user_id as string))];
    const { data: prefRows } = await admin
      .from("goal_reminder_prefs")
      .select("user_id, enabled, reminder_hour, channel")
      .in("user_id", owners);
    const prefs = new Map(
      (prefRows ?? []).map((p) => [p.user_id as string, p]),
    );

    const wantsEmail = candidates.some((c) => {
      const ch = prefs.get(c.owner_user_id as string)?.channel ?? DEFAULT_PREF.channel;
      return ch !== "in_app";
    });
    const emailFor = new Map<string, string>();
    if (wantsEmail) {
      const { data: profiles } = await admin.from("profiles").select("id, email").in("id", owners);
      for (const p of profiles ?? []) if (p.email) emailFor.set(p.id as string, p.email as string);
    }

    let sent = 0;
    let emailed = 0;
    for (const item of candidates) {
      const ownerId = item.owner_user_id as string;
      const pref = prefs.get(ownerId) ?? DEFAULT_PREF;
      if (!pref.enabled) {
        note(item, "skipped", "Reminders are turned off in this person's settings");
        continue;
      }
      if ((pref.reminder_hour ?? DEFAULT_PREF.reminder_hour) !== hourNow) {
        note(
          item,
          "skipped",
          `Not their reminder hour yet (they chose ${pref.reminder_hour ?? DEFAULT_PREF.reminder_hour}:00 Eastern)`,
        );
        continue;
      }
      if (alreadySent.has(item.id)) {
        note(item, "skipped", "Already reminded earlier today");
        continue;
      }
      if (doneBy.has(`${item.id}:${ownerId}`)) {
        note(item, "skipped", "Step was already checked off today");
        continue;
      }

      const daysLeft = daysLeftOf(item.due_date as string);
      const { heading, line } = copyFor(item.title, item.due_date as string, daysLeft);
      const channel = pref.channel ?? DEFAULT_PREF.channel;
      let inAppOk = false;
      let emailOk = false;
      let failure: string | null = null;

      if (channel !== "email") {
        const { error: nErr } = await admin.from("notifications").insert({
          org_id: item.org_id,
          recipient_user_id: ownerId,
          notification_type: "goal_step_due",
          title: heading,
          message: line,
          related_table: "checklist_items",
          related_id: item.id,
        });
        if (nErr) {
          console.error("Goal step reminder failed", { item: item.id, error: nErr.message });
          note(item, "failed", "In-app notification could not be saved", channel);
          continue;
        }
        inAppOk = true;
        sent += 1;
      }

      if (channel !== "in_app") {
        const to = emailFor.get(ownerId);
        if (!to) {
          failure = "No email address on file for this person";
        } else {
          emailOk = await enqueueReminderEmail(admin, to, heading, line, item.id, today);
          if (emailOk) emailed += 1;
          else failure = "Email could not be queued";
        }
      }

      if (inAppOk || emailOk) {
        const where = inAppOk && emailOk ? "in-app and email" : inAppOk ? "in-app" : "email";
        note(item, "sent", failure ? `Sent ${where}; ${failure}` : `Sent ${where}`, channel);
      } else {
        note(item, "failed", failure ?? "Nothing could be delivered", channel);
      }
    }

    await flushLog();

    return new Response(JSON.stringify({ checked: candidates.length, sent, emailed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("goal-step-reminders failed", e);
    return new Response(JSON.stringify({ error: "Reminder run failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
