import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = "Purple Envelope";
const FROM_DOMAIN = "purpleenvelope.app";
const SENDER_DOMAIN = "notify.purpleenvelope.app";
const FALLBACK_ORIGIN = "https://purpleenvelope.app";
const ALLOWED_ORIGINS = [
  "https://purpleenvelope.app",
  "https://www.purpleenvelope.app",
  "https://timekeepers.me",
  "https://www.timekeepers.me",
  "http://localhost:5173",
  "http://localhost:8080",
];

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

// Mirrors src/lib/invite-details.ts (edge functions cannot import from src/).
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseStartDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return trimmed;
}

function parseInitialPtoHours(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "string" && input.trim() === "") return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(-9999, Math.min(99999, n));
  return Math.round(clamped * 100) / 100;
}

function coerceTime(value: unknown, fallback: string): string {
  return typeof value === "string" && TIME_RE.test(value) ? value : fallback;
}

// Normalizes into exactly one row per weekday (0-6); only enabled days are kept
// for storage so accept-invite materializes a clean schedule.
function sanitizeWeeklySchedule(input: unknown): Array<{ weekday: number; enabled: boolean; start_time: string; end_time: string }> {
  const byDay = new Map<number, Record<string, unknown>>();
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== "object") continue;
      const day = Number((raw as { weekday?: unknown }).weekday);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      byDay.set(day, raw as Record<string, unknown>);
    }
  }
  const full = [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const row = byDay.get(weekday);
    return {
      weekday,
      enabled: row ? Boolean(row.enabled) : false,
      start_time: coerceTime(row?.start_time, "08:00"),
      end_time: coerceTime(row?.end_time, "17:00"),
    };
  });
  return full.filter((d) => d.enabled);
}

function inviteEmailHtml(orgName: string, role: string, link: string): string {
  const org = escapeHtml(orgName);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;padding:40px 20px;">
      <div style="background:#53406e;border-radius:12px 12px 0 0;padding:24px 32px;">
        <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.02em;">Purple Envelope</div>
        <div style="color:#d9d2e6;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin-top:4px;">Practice Operations</div>
      </div>
      <div style="background:#ffffff;border:1px solid #e6e2ec;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
        <h1 style="margin:0 0 16px;font-size:22px;color:#1d1830;">You're invited to join ${org}</h1>
        <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4a4458;">
          ${org} has invited you to join their team on Purple Envelope as a <strong>${escapeHtml(role)}</strong>.
        </p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4458;">
          Click the button below to create your account and get started.
        </p>
        <a href="${link}" style="display:inline-block;background:#53406e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px;">Accept your invite</a>
        <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a8496;">
          This link expires in 7 days. If the button doesn't work, paste this into your browser:<br/>
          <span style="word-break:break-all;color:#53406e;">${link}</span>
        </p>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#9a94a8;text-align:center;">
        Only your business, never your patients.
      </p>
    </div>
  </body>
</html>`;
}

function inviteEmailText(orgName: string, role: string, link: string): string {
  return `You're invited to join ${orgName}

${orgName} has invited you to join their team on Purple Envelope as a ${role}.

Open this link to create your account and get started (expires in 7 days):
${link}

— Purple Envelope · Only your business, never your patients.`;
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
    const body = await req.json();
    const rawEmail = typeof body?.email === "string" ? body.email.toLowerCase().trim() : "";
    const role = body?.role;
    const origin = typeof body?.origin === "string" ? body.origin : "";
    // The inviter answers the profile questions up front: the new member's
    // name and what they'll actually do. Onboarding never has to ask.
    const invitedName = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
    const operationalRole = typeof body?.operationalRole === "string" ? body.operationalRole : "";
    const secondaryRoles: string[] = Array.isArray(body?.secondaryRoles)
      ? body.secondaryRoles.filter((r: unknown) => typeof r === "string")
      : [];
    // Onboarding details the inviter fills in up front so PTO/attendance
    // tracking is correct from the moment the new hire joins.
    const startDate = parseStartDate(body?.startDate);
    const initialPtoHours = parseInitialPtoHours(body?.initialPtoHours);
    const weeklySchedule = sanitizeWeeklySchedule(body?.schedule);

    const OPERATIONAL_ROLES = [
      "dentist", "hygienist", "dental_assistant", "front_desk",
      "office_manager", "sterilization", "floater", "other",
    ];

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return new Response(JSON.stringify({ error: "A valid email address is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (role !== "employee" && role !== "manager") {
      return new Response(JSON.stringify({ error: "Role must be employee or manager" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!invitedName) {
      return new Response(JSON.stringify({ error: "The team member's name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!OPERATIONAL_ROLES.includes(operationalRole)) {
      return new Response(JSON.stringify({ error: "A valid operational role is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const cleanSecondary = [...new Set(secondaryRoles)].filter(
      (r) => OPERATIONAL_ROLES.includes(r) && r !== operationalRole,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: only active owners/managers may invite, and only into
    // their own org (derived from their membership — never from the client).
    const { data: membership } = await supabaseAdmin
      .from("org_members")
      .select("org_id, role, orgs:org_id(name)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "manager"])
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Only owners and managers can send invites" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orgId = membership.org_id;
    const orgName = (membership as any).orgs?.name || "Your office";

    // Reuse a live pending invite for the same org+email instead of stacking
    // duplicates — refreshed with the latest name/roles the inviter entered.
    const { data: existing } = await supabaseAdmin
      .from("org_invites")
      .select("id, token")
      .eq("org_id", orgId)
      .eq("email", rawEmail)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const profileFields = {
      invited_name: invitedName,
      operational_role: operationalRole,
      secondary_roles: cleanSecondary,
      invited_by: user.id,
      start_date: startDate,
      initial_pto_hours: initialPtoHours,
      weekly_schedule: weeklySchedule,
    };

    let token: string;
    if (existing?.token) {
      token = existing.token;
      await supabaseAdmin.from("org_invites").update(profileFields).eq("id", existing.id);
    } else {
      const { data: invite, error: inviteError } = await supabaseAdmin
        .from("org_invites")
        .insert({ org_id: orgId, email: rawEmail, role, ...profileFields })
        .select("token")
        .single();
      if (inviteError || !invite) {
        console.error("Failed to create invite", { error: inviteError, email: maskEmail(rawEmail) });
        return new Response(JSON.stringify({ error: "Failed to create invite" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      token = invite.token;
    }

    const { data: alreadyAllowed } = await supabaseAdmin
      .from("allowed_users")
      .select("id")
      .eq("email", rawEmail)
      .maybeSingle();

    if (!alreadyAllowed) {
      const { error: allowError } = await supabaseAdmin
        .from("allowed_users")
        .insert({ email: rawEmail });

      if (allowError) {
        console.error("Failed to allow invited user", { error: allowError, email: maskEmail(rawEmail) });
        return new Response(JSON.stringify({ error: "Failed to prepare invite access" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const base = ALLOWED_ORIGINS.includes(origin) ? origin : FALLBACK_ORIGIN;
    const link = `${base}/accept-invite?token=${token}`;

    let unsubscribeToken = crypto.randomUUID();
    const { data: existingUnsubscribeToken } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", rawEmail)
      .maybeSingle();

    if (existingUnsubscribeToken?.token) {
      unsubscribeToken = existingUnsubscribeToken.token;
    } else {
      const { data: newUnsubscribeToken, error: unsubscribeTokenError } = await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .insert({ email: rawEmail, token: unsubscribeToken })
        .select("token")
        .single();

      if (unsubscribeTokenError || !newUnsubscribeToken?.token) {
        console.error("Failed to create unsubscribe token", { error: unsubscribeTokenError, email: maskEmail(rawEmail) });
        return new Response(
          JSON.stringify({ success: true, emailed: false, link, warning: "Invite created but the email could not be prepared. Share the link manually." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      unsubscribeToken = newUnsubscribeToken.token;
    }

    // Enqueue onto the transactional queue; process-email-queue does the sending.
    const messageId = crypto.randomUUID();
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "org_invite",
      recipient_email: rawEmail,
      status: "pending",
    });

    const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        idempotency_key: `org-invite-${messageId}`,
        message_id: messageId,
        to: rawEmail,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: `${orgName} invited you to Purple Envelope`,
        html: inviteEmailHtml(orgName, role, link),
        text: inviteEmailText(orgName, role, link),
        purpose: "transactional",
        label: "org_invite",
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error("Failed to enqueue invite email", { error: enqueueError, email: maskEmail(rawEmail) });
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "org_invite",
        recipient_email: rawEmail,
        status: "failed",
        error_message: "Failed to enqueue email",
      });
      // The invite itself exists — return the link so the manager can share it manually.
      return new Response(
        JSON.stringify({ success: true, emailed: false, link, warning: "Invite created but the email could not be queued. Share the link manually." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Org invite enqueued", { email: maskEmail(rawEmail), role });
    return new Response(JSON.stringify({ success: true, emailed: true, link }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-org-invite error", { error: e?.message });
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
