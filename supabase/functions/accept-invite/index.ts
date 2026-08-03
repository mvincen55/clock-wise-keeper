import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function canonicalEmail(email: unknown): string {
  const normalized = normalizeEmail(email);
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return normalized;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    const base = local.split("+")[0].replace(/\./g, "");
    return `${base}@gmail.com`;
  }
  return normalized;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { token, lookup } = body ?? {};
    if (!token || typeof token !== "string" || token.length < 10) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to manage invite acceptance
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Lookup mode: minimal invite info for the AcceptInvite page (no auth required, token acts as the secret)
    if (lookup === true) {
      const { data: inv } = await supabaseAdmin
        .from("org_invites")
        .select("email, role, invited_name, expires_at, accepted_at, org_id, orgs:org_id(name)")
        .eq("token", token)
        .maybeSingle();
      if (!inv) {
        return new Response(JSON.stringify({ error: "Invite not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ invite: inv }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the caller's auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Look up the invite using service role
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("org_invites")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found or already used" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiry
    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Invite has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check email matches. Gmail treats dots and +tags as the same inbox,
    // so accept those equivalent forms while keeping other domains exact.
    if (canonicalEmail(user.email) !== canonicalEmail(invite.email)) {
      return new Response(
        JSON.stringify({
          error: "Email does not match invite",
          code: "email_mismatch",
          signedInEmail: normalizeEmail(user.email),
          inviteEmail: normalizeEmail(invite.email),
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = normalizeEmail(invite.email);
    const { data: alreadyAllowed } = await supabaseAdmin
      .from("allowed_users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!alreadyAllowed) {
      const { error: allowError } = await supabaseAdmin
        .from("allowed_users")
        .insert({ email: normalizedEmail });

      if (allowError) {
        return new Response(
          JSON.stringify({ error: "Failed to activate invite access" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if already a member
    const { data: existing } = await supabaseAdmin
      .from("org_members")
      .select("id")
      .eq("org_id", invite.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      // Mark invite accepted and return success
      await supabaseAdmin
        .from("org_invites")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({ success: true, org_id: invite.org_id, already_member: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create org_member
    const { error: memberError } = await supabaseAdmin.from("org_members").insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role,
      status: "active",
    });

    if (memberError) {
      return new Response(
        JSON.stringify({ error: "Failed to create membership: " + memberError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The inviter already answered the profile questions: the member's name
    // and operational role(s) ride in on the invite itself.
    const invitedName = typeof invite.invited_name === "string" ? invite.invited_name.trim() : "";

    // Link employee record if one exists with matching email
    const { data: empRecord } = await supabaseAdmin
      .from("employees")
      .select("id, user_id")
      .eq("org_id", invite.org_id)
      .eq("email", invite.email.toLowerCase())
      .is("user_id", null)
      .maybeSingle();

    let employeeId: string | null = null;
    if (empRecord) {
      employeeId = empRecord.id;
      await supabaseAdmin
        .from("employees")
        .update({ user_id: user.id, ...(invitedName ? { display_name: invitedName } : {}) })
        .eq("id", empRecord.id);
    } else {
      // Create a new employee record, named by the inviter.
      const { data: created } = await supabaseAdmin
        .from("employees")
        .insert({
          org_id: invite.org_id,
          user_id: user.id,
          display_name:
            invitedName || user.user_metadata?.full_name || user.email?.split("@")[0] || "Employee",
          email: user.email,
          employment_status: "active",
        })
        .select("id")
        .single();
      employeeId = created?.id ?? null;
    }

    // Apply the operational role(s) the inviter chose, pre-confirmed by them.
    // Best-effort: a role hiccup must never block joining the office.
    if (employeeId && typeof invite.operational_role === "string" && invite.operational_role) {
      const now = new Date().toISOString();
      const confirmer = invite.invited_by ?? user.id;
      const secondary: string[] = Array.isArray(invite.secondary_roles) ? invite.secondary_roles : [];
      const roleRows = [
        { operational_role: invite.operational_role, is_primary: true },
        ...secondary
          .filter((r) => r !== invite.operational_role)
          .map((r) => ({ operational_role: r, is_primary: false })),
      ].map((r) => ({
        ...r,
        org_id: invite.org_id,
        employee_id: employeeId,
        created_by: confirmer,
        confirmed_by: confirmer,
        confirmed_at: now,
      }));
      const { error: rolesError } = await supabaseAdmin
        .from("employee_operational_roles")
        .upsert(roleRows, { onConflict: "org_id,employee_id,operational_role", ignoreDuplicates: true });
      if (rolesError) {
        console.warn("accept-invite: could not apply operational roles", rolesError.message);
      }
    }

    // Mark invite accepted
    await supabaseAdmin
      .from("org_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return new Response(
      JSON.stringify({ success: true, org_id: invite.org_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
