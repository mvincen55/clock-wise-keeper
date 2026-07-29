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

    // Reuse a live pending invite for the same org+email instead of stacking duplicates.
    const { data: existing } = await supabaseAdmin
      .from("org_invites")
      .select("token")
      .eq("org_id", orgId)
      .eq("email", rawEmail)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let token: string;
    if (existing?.token) {
      token = existing.token;
    } else {
      const { data: invite, error: inviteError } = await supabaseAdmin
        .from("org_invites")
        .insert({ org_id: orgId, email: rawEmail, role })
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

    const base = ALLOWED_ORIGINS.includes(origin) ? origin : FALLBACK_ORIGIN;
    const link = `${base}/accept-invite?token=${token}`;

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
        run_id: crypto.randomUUID(),
        message_id: messageId,
        to: rawEmail,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: `${orgName} invited you to Purple Envelope`,
        html: inviteEmailHtml(orgName, role, link),
        text: inviteEmailText(orgName, role, link),
        purpose: "transactional",
        label: "org_invite",
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
