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

/** "Jordan Rivera" -> "JR". Mirrors the client-side suggestion. */
function suggestTagFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const letters =
    parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The tag the inviter picked — or the nearest free variant (JR, JR2, JR3…)
 * if someone claimed it between the invite going out and being accepted.
 */
function pickFreeTag(wanted: string, fallbackName: string, taken: Set<string>): string | null {
  const base = (wanted || suggestTagFromName(fallbackName))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
  if (!/^[A-Z0-9]{2,4}$/.test(base)) return null;
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base.slice(0, 4 - String(i).length)}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
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

    // The inviter already answered the profile questions: the member's name,
    // operational role(s), side of office, preferred name, and report tag all
    // ride in on the invite itself. Older pending invites may lack the basics
    // fields — those members are asked in onboarding instead.
    const invitedName = typeof invite.invited_name === "string" ? invite.invited_name.trim() : "";
    const invitedTeam =
      invite.invited_team === "clinical" || invite.invited_team === "clerical"
        ? invite.invited_team
        : null;
    const invitedPreferred =
      typeof invite.invited_preferred_name === "string" && invite.invited_preferred_name.trim()
        ? invite.invited_preferred_name.trim()
        : invitedName.split(/\s+/)[0] ?? "";
    const basicsPatch = invitedTeam
      ? { team: invitedTeam, ...(invitedPreferred ? { preferred_name: invitedPreferred } : {}) }
      : {};

    // Link employee record if one exists with matching email
    const { data: empRecord } = await supabaseAdmin
      .from("employees")
      .select("id, user_id, tag")
      .eq("org_id", invite.org_id)
      .eq("email", invite.email.toLowerCase())
      .is("user_id", null)
      .maybeSingle();

    let employeeId: string | null = null;
    let basicsWritten = false;
    if (empRecord) {
      employeeId = empRecord.id;
      const { error: linkError } = await supabaseAdmin
        .from("employees")
        .update({
          user_id: user.id,
          ...(invitedName ? { display_name: invitedName } : {}),
          ...basicsPatch,
        })
        .eq("id", empRecord.id);
      basicsWritten = !linkError;
      if (linkError) console.warn("accept-invite: could not link employee", linkError.message);
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
          ...basicsPatch,
        })
        .select("id")
        .single();
      employeeId = created?.id ?? null;
      basicsWritten = !!created;
    }

    // Apply the tag the inviter picked. A tag already on the record wins —
    // tags are permanent, an invite never overwrites one. Best-effort: a tag
    // hiccup must never block joining the office.
    let tagSettled = false;
    if (employeeId && invitedTeam) {
      if (empRecord?.tag) {
        tagSettled = true;
      } else {
        const wanted = typeof invite.invited_tag === "string" ? invite.invited_tag : "";
        const { data: tagRows } = await supabaseAdmin
          .from("employee_tags")
          .select("tag, employee_id")
          .eq("org_id", invite.org_id);
        const taken = new Set(
          (tagRows ?? [])
            .filter((r) => r.employee_id !== employeeId)
            .map((r) => String(r.tag).toUpperCase()),
        );
        const finalTag = pickFreeTag(wanted, invitedName || user.email || "", taken);
        if (finalTag) {
          const { error: tagError } = await supabaseAdmin
            .from("employees")
            .update({ tag: finalTag })
            .eq("id", employeeId);
          if (tagError) console.warn("accept-invite: could not apply tag", tagError.message);
          else tagSettled = true;
        }
      }
    }

    // These fields are exactly what the Basics onboarding step used to collect.
    // The inviter answered it, so the step is done before the member starts —
    // if anything above fell through, onboarding falls back to asking them.
    if (employeeId && invitedTeam && basicsWritten && tagSettled) {
      const { error: onboardingError } = await supabaseAdmin.from("member_onboarding").upsert(
        { org_id: invite.org_id, user_id: user.id, basics_done_at: new Date().toISOString() },
        { onConflict: "org_id,user_id" },
      );
      if (onboardingError) {
        console.warn("accept-invite: could not mark basics done", onboardingError.message);
      }
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
