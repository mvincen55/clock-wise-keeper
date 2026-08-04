import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = "Purple Envelope";
const FROM_DOMAIN = "purpleenvelope.app";
const SENDER_DOMAIN = "notify.purpleenvelope.app";
const APP_URL = "https://purpleenvelope.app/acknowledgments";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AdminClient = ReturnType<typeof createClient>;

type EscalationSettings = {
  org_id: string;
  routine_reminders_enabled: boolean;
  email_after_workdays: number;
  manager_after_workdays: number;
  owner_after_workdays: number;
  question_pauses_escalation: boolean;
};

type Assignment = {
  id: string;
  org_id: string;
  user_id: string;
  role_at_assignment: "owner" | "manager" | "employee";
  title_snapshot: string;
  version_number_snapshot: number;
  due_at: string;
  acknowledged_at: string | null;
  waived_at: string | null;
  blocked_at: string | null;
  blocked_reason: string;
  snoozed_until: string | null;
  snooze_reason: string;
  question_asked_at: string | null;
  question_resolved_at: string | null;
  escalation_level: number;
  overdue_at: string | null;
  next_escalation_at: string | null;
};

function maskEmail(email: unknown): string {
  if (typeof email !== "string" || !email.includes("@")) return "<invalid>";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailHtml(heading: string, line: string, buttonLabel: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:540px;margin:0 auto;padding:40px 20px;">
      <div style="background:#53406e;border-radius:12px 12px 0 0;padding:24px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.02em;">Purple Envelope</div>
        <div style="color:#d9d2e6;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">Practice Operations</div>
      </div>
      <div style="background:#ffffff;border:1px solid #e6e2ec;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#1d1830;">${escapeHtml(heading)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4a4458;">${escapeHtml(line)}</p>
        <a href="${APP_URL}" style="display:inline-block;background:#53406e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;">${escapeHtml(buttonLabel)}</a>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#9a94a8;text-align:center;">Only your business, never your patients.</p>
    </div>
  </body>
</html>`;
}

async function routineWindow(
  admin: AdminClient,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("knowledge_routine_notice_window", {
    p_org_id: orgId,
    p_user_id: userId,
    p_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Could not resolve work window", { orgId, userId, error: error.message });
    return false;
  }
  return data === true;
}

async function addWorkingDays(
  admin: AdminClient,
  orgId: string,
  userId: string,
  workdays: number,
  targetTime = "09:00",
): Promise<string> {
  const { data, error } = await admin.rpc("knowledge_add_working_days", {
    p_org_id: orgId,
    p_user_id: userId,
    p_start: new Date().toISOString(),
    p_workdays: workdays,
    p_target_time: targetTime,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Could not calculate the next working date");
  }
  return data as string;
}

async function recordEvent(
  admin: AdminClient,
  input: {
    assignmentId: string;
    eventKey: string;
    eventType: string;
    channel: "system" | "in_app" | "email";
    recipientUserId?: string | null;
    detail: string;
    metadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc("knowledge_record_acknowledgment_event", {
    p_assignment_id: input.assignmentId,
    p_event_key: input.eventKey,
    p_event_type: input.eventType,
    p_channel: input.channel,
    p_actor_user_id: null,
    p_recipient_user_id: input.recipientUserId ?? null,
    p_detail: input.detail,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(error.message);
  return data === true;
}

async function sendInApp(
  admin: AdminClient,
  input: {
    assignment: Assignment;
    recipientUserId: string;
    notificationType: string;
    title: string;
    message: string;
    eventKey: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_user_id", input.recipientUserId)
    .eq("related_table", "knowledge_acknowledgments")
    .eq("related_id", input.assignment.id)
    .eq("notification_type", input.notificationType);

  if ((count ?? 0) === 0) {
    const { error } = await admin.from("notifications").insert({
      org_id: input.assignment.org_id,
      recipient_user_id: input.recipientUserId,
      notification_type: input.notificationType,
      title: input.title,
      message: input.message,
      related_table: "knowledge_acknowledgments",
      related_id: input.assignment.id,
    });
    if (error) throw new Error(error.message);
  }

  return recordEvent(admin, {
    assignmentId: input.assignment.id,
    eventKey: input.eventKey,
    eventType: input.eventType,
    channel: "in_app",
    recipientUserId: input.recipientUserId,
    detail: input.message,
    metadata: input.metadata,
  });
}

async function ensureUnsubscribeToken(admin: AdminClient, email: string): Promise<string> {
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", email)
    .maybeSingle();
  if (existing?.token) return existing.token as string;

  const token = crypto.randomUUID();
  const { data: created, error } = await admin
    .from("email_unsubscribe_tokens")
    .insert({ email, token })
    .select("token")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (created?.token as string | undefined) ?? token;
}

async function queueEmail(
  admin: AdminClient,
  input: {
    assignment: Assignment;
    recipientUserId: string;
    eventKey: string;
    subject: string;
    heading: string;
    line: string;
    label: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  },
): Promise<"queued" | "missing_email" | "already_queued"> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", input.recipientUserId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const email = profile?.email as string | undefined;
  if (!email) {
    await recordEvent(admin, {
      assignmentId: input.assignment.id,
      eventKey: `${input.eventKey}:missing-email`,
      eventType: input.eventType,
      channel: "email",
      recipientUserId: input.recipientUserId,
      detail: "Email could not be queued because the recipient has no email address.",
      metadata: { ...input.metadata, delivery: "missing_email" },
    });
    return "missing_email";
  }

  const idempotencyKey = input.eventKey;
  const { count: existingCount } = await admin
    .from("email_send_log")
    .select("id", { count: "exact", head: true })
    .eq("template_name", input.label)
    .eq("recipient_email", email)
    .in("status", ["pending", "sent"])
    .contains("metadata", { idempotency_key: idempotencyKey });

  // Older email_send_log rows may not have metadata. The event receipt is the
  // primary idempotency lock; the provider receives the same key as a second lock.
  const { data: eventExists } = await admin
    .from("knowledge_acknowledgment_events")
    .select("id")
    .eq("org_id", input.assignment.org_id)
    .eq("event_key", input.eventKey)
    .maybeSingle();
  if ((existingCount ?? 0) > 0 || eventExists) return "already_queued";

  const messageId = crypto.randomUUID();
  const unsubscribeToken = await ensureUnsubscribeToken(admin, email);

  await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: input.label,
    recipient_email: email,
    status: "pending",
  });

  const { error: enqueueError } = await admin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      idempotency_key: idempotencyKey,
      message_id: messageId,
      to: email,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: input.subject,
      html: emailHtml(input.heading, input.line, "Open acknowledgments"),
      text: `${input.line}\n\n${APP_URL}`,
      purpose: "transactional",
      label: input.label,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  });

  if (enqueueError) {
    console.error("Failed to enqueue acknowledgment email", {
      assignment: input.assignment.id,
      email: maskEmail(email),
      error: enqueueError.message,
    });
    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: input.label,
      recipient_email: email,
      status: "failed",
      error_message: "Failed to enqueue acknowledgment email",
    });
    throw new Error(enqueueError.message);
  }

  await recordEvent(admin, {
    assignmentId: input.assignment.id,
    eventKey: input.eventKey,
    eventType: input.eventType,
    channel: "email",
    recipientUserId: input.recipientUserId,
    detail: input.line,
    metadata: { ...input.metadata, delivery: "queued", email: maskEmail(email) },
  });

  return "queued";
}

async function escalationRecipients(
  admin: AdminClient,
  assignment: Assignment,
  target: "manager" | "owner",
): Promise<string[]> {
  let roles: string[] = target === "manager" ? ["manager"] : ["owner"];

  let { data: members, error } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", assignment.org_id)
    .eq("status", "active")
    .in("role", roles)
    .neq("user_id", assignment.user_id);
  if (error) throw new Error(error.message);

  if (!members?.length) {
    roles = target === "manager" ? ["owner"] : ["manager"];
    const fallback = await admin
      .from("org_members")
      .select("user_id, role")
      .eq("org_id", assignment.org_id)
      .eq("status", "active")
      .in("role", roles)
      .neq("user_id", assignment.user_id);
    if (fallback.error) throw new Error(fallback.error.message);
    members = fallback.data;
  }

  const available: string[] = [];
  for (const member of members ?? []) {
    if (await routineWindow(admin, assignment.org_id, member.user_id as string)) {
      available.push(member.user_id as string);
    }
  }
  return available;
}

async function updateStage(
  admin: AdminClient,
  assignment: Assignment,
  level: number,
  nextEscalationAt: string | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin
    .from("knowledge_acknowledgments")
    .update({
      escalation_level: level,
      last_escalated_at: new Date().toISOString(),
      next_escalation_at: nextEscalationAt,
      ...extra,
    })
    .eq("id", assignment.id)
    .eq("acknowledged_at", null)
    .eq("waived_at", null);
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) return json({ error: "Backend not configured" }, 500);

  const bearer = req.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!bearer || bearer !== serviceKey) {
    return json({ error: "Not authorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const now = new Date();
    const { data: rows, error: assignmentError } = await admin
      .from("knowledge_acknowledgments")
      .select(
        "id, org_id, user_id, role_at_assignment, title_snapshot, version_number_snapshot, due_at, acknowledged_at, waived_at, blocked_at, blocked_reason, snoozed_until, snooze_reason, question_asked_at, question_resolved_at, escalation_level, overdue_at, next_escalation_at",
      )
      .is("acknowledged_at", null)
      .is("waived_at", null)
      .or(`next_escalation_at.lte.${now.toISOString()},next_escalation_at.is.null`)
      .order("next_escalation_at", { ascending: true, nullsFirst: true })
      .limit(500);
    if (assignmentError) throw new Error(assignmentError.message);

    const assignments = (rows ?? []) as Assignment[];
    const settingsByOrg = new Map<string, EscalationSettings>();

    let checked = 0;
    let paused = 0;
    let reminded = 0;
    let emailed = 0;
    let managerEscalated = 0;
    let ownerEscalated = 0;
    let unavailable = 0;
    let failed = 0;

    for (const assignment of assignments) {
      checked += 1;
      try {
        let settings = settingsByOrg.get(assignment.org_id);
        if (!settings) {
          const { data, error } = await admin
            .from("knowledge_acknowledgment_escalation_settings")
            .select("*")
            .eq("org_id", assignment.org_id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          settings = (data ?? {
            org_id: assignment.org_id,
            routine_reminders_enabled: true,
            email_after_workdays: 1,
            manager_after_workdays: 2,
            owner_after_workdays: 2,
            question_pauses_escalation: true,
          }) as EscalationSettings;
          settingsByOrg.set(assignment.org_id, settings);
        }

        if (!settings.routine_reminders_enabled) {
          paused += 1;
          continue;
        }
        if (assignment.blocked_at) {
          paused += 1;
          continue;
        }
        if (
          assignment.question_asked_at &&
          !assignment.question_resolved_at &&
          settings.question_pauses_escalation
        ) {
          paused += 1;
          continue;
        }
        if (assignment.snoozed_until && new Date(assignment.snoozed_until) > now) {
          paused += 1;
          continue;
        }

        if (assignment.snoozed_until && new Date(assignment.snoozed_until) <= now) {
          await admin
            .from("knowledge_acknowledgments")
            .update({ snoozed_until: null, snooze_reason: "" })
            .eq("id", assignment.id);
        }

        if (!(await routineWindow(admin, assignment.org_id, assignment.user_id))) {
          unavailable += 1;
          continue;
        }

        const nextAt = assignment.next_escalation_at
          ? new Date(assignment.next_escalation_at)
          : new Date(assignment.due_at);
        if (nextAt > now) continue;

        if (assignment.escalation_level === 0) {
          const message = `“${assignment.title_snapshot}” is now due. Open the exact version, acknowledge it, ask a question, mark it blocked, or use a reasoned snooze.`;
          await sendInApp(admin, {
            assignment,
            recipientUserId: assignment.user_id,
            notificationType: "knowledge_acknowledgment_due",
            title: "Office acknowledgment is due",
            message,
            eventKey: `ack-due:${assignment.id}`,
            eventType: "reminder_in_app",
            metadata: { level: 1 },
          });

          if (!assignment.overdue_at) {
            await recordEvent(admin, {
              assignmentId: assignment.id,
              eventKey: `ack-overdue:${assignment.id}`,
              eventType: "overdue",
              channel: "system",
              recipientUserId: assignment.user_id,
              detail: "The working-day acknowledgment deadline passed without a signature.",
              metadata: { due_at: assignment.due_at },
            });
          }

          const next = await addWorkingDays(
            admin,
            assignment.org_id,
            assignment.user_id,
            settings.email_after_workdays,
          );
          await updateStage(admin, assignment, 1, next, {
            overdue_at: assignment.overdue_at ?? now.toISOString(),
          });
          reminded += 1;
          continue;
        }

        if (assignment.escalation_level === 1) {
          const line = `“${assignment.title_snapshot},” version ${assignment.version_number_snapshot}, is overdue. Open the exact version to sign, ask a question, document a blocker, or use an available reasoned snooze.`;
          await queueEmail(admin, {
            assignment,
            recipientUserId: assignment.user_id,
            eventKey: `ack-email:${assignment.id}:subject`,
            subject: `Overdue office acknowledgment: ${assignment.title_snapshot}`,
            heading: "An office acknowledgment is overdue",
            line,
            label: "knowledge_acknowledgment_overdue",
            eventType: "reminder_email_queued",
            metadata: { level: 2 },
          });

          const next = await addWorkingDays(
            admin,
            assignment.org_id,
            assignment.user_id,
            settings.manager_after_workdays,
          );
          await updateStage(admin, assignment, 2, next);
          emailed += 1;
          continue;
        }

        if (assignment.escalation_level === 2) {
          const recipients = await escalationRecipients(admin, assignment, "manager");
          if (recipients.length === 0) {
            unavailable += 1;
            continue;
          }

          for (const recipient of recipients) {
            const line = `“${assignment.title_snapshot}” remains unsigned after the in-app and email reminders. The record also shows whether it is blocked, snoozed, or waiting on a question.`;
            await sendInApp(admin, {
              assignment,
              recipientUserId: recipient,
              notificationType: "knowledge_acknowledgment_manager_escalation",
              title: "An acknowledgment needs manager follow-up",
              message: line,
              eventKey: `ack-manager:${assignment.id}:${recipient}:in-app`,
              eventType: "manager_escalated",
              metadata: { level: 3 },
            });
            await queueEmail(admin, {
              assignment,
              recipientUserId: recipient,
              eventKey: `ack-manager:${assignment.id}:${recipient}:email`,
              subject: `Manager follow-up: ${assignment.title_snapshot}`,
              heading: "An acknowledgment needs manager follow-up",
              line,
              label: "knowledge_acknowledgment_manager_escalation",
              eventType: "manager_escalated",
              metadata: { level: 3 },
            });
          }

          const next = await addWorkingDays(
            admin,
            assignment.org_id,
            assignment.user_id,
            settings.owner_after_workdays,
          );
          await updateStage(admin, assignment, 3, next);
          managerEscalated += 1;
          continue;
        }

        if (assignment.escalation_level === 3) {
          const recipients = await escalationRecipients(admin, assignment, "owner");
          if (recipients.length === 0) {
            unavailable += 1;
            continue;
          }

          for (const recipient of recipients) {
            const line = `“${assignment.title_snapshot}” remains unresolved after the subject and manager stages. This is a factual escalation receipt, not an automatic disciplinary finding.`;
            await sendInApp(admin, {
              assignment,
              recipientUserId: recipient,
              notificationType: "knowledge_acknowledgment_owner_escalation",
              title: "An acknowledgment has reached owner review",
              message: line,
              eventKey: `ack-owner:${assignment.id}:${recipient}:in-app`,
              eventType: "owner_escalated",
              metadata: { level: 4 },
            });
            await queueEmail(admin, {
              assignment,
              recipientUserId: recipient,
              eventKey: `ack-owner:${assignment.id}:${recipient}:email`,
              subject: `Owner review: ${assignment.title_snapshot}`,
              heading: "An acknowledgment has reached owner review",
              line,
              label: "knowledge_acknowledgment_owner_escalation",
              eventType: "owner_escalated",
              metadata: { level: 4 },
            });
          }

          await updateStage(admin, assignment, 4, null);
          ownerEscalated += 1;
        }
      } catch (error) {
        failed += 1;
        console.error("Acknowledgment escalation failed for one assignment", {
          assignment: assignment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return json({
      checked,
      paused,
      unavailable,
      reminded,
      emailed,
      manager_escalated: managerEscalated,
      owner_escalated: ownerEscalated,
      failed,
    });
  } catch (error) {
    console.error(
      "acknowledgment-escalation failed",
      error instanceof Error ? error.message : error,
    );
    return json({ error: "Acknowledgment escalation run failed" }, 500);
  }
});
