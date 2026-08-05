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

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Today's date (UTC) as a fallback anchor when the inviter left start date blank.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidStartDate(input: unknown): input is string {
  return typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input);
}

// The invite stores an already-sanitized array of enabled weekday rows, but be
// defensive: keep only well-formed, enabled entries with valid times.
function sanitizeInviteSchedule(
  input: unknown,
): Array<{ weekday: number; start_time: string; end_time: string }> {
  if (!Array.isArray(input)) return [];
  const seen = new Set<number>();
  const rows: Array<{ weekday: number; start_time: string; end_time: string }> = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const day = Number((raw as { weekday?: unknown }).weekday);
    if (!Number.isInteger(day) || day < 0 || day > 6 || seen.has(day)) continue;
    if (!(raw as { enabled?: unknown }).enabled) continue;
    const start = (raw as { start_time?: unknown }).start_time;
    const end = (raw as { end_time?: unknown }).end_time;
    if (typeof start !== "string" || !TIME_RE.test(start)) continue;
    if (typeof end !== "string" || !TIME_RE.test(end)) continue;
    seen.add(day);
    rows.push({ weekday: day, start_time: start, end_time: end });
  }
  return rows;
}

// Seeds hire date, PTO settings/opening balance, and a starting schedule from
// the invite. Best-effort: a hiccup here must never block someone from joining,
// so every step is wrapped and only logged on failure.
async function applyOnboardingDetails(
  supabaseAdmin: ReturnType<typeof createClient>,
  invite: Record<string, unknown>,
  employeeId: string,
  userId: string,
): Promise<void> {
  const startDate = isValidStartDate(invite.start_date) ? (invite.start_date as string) : null;
  const anchorDate = startDate ?? todayIso();
  const orgId = invite.org_id as string;
  const timezone = "America/New_York";

  // 1. Hire date on the employee record.
  if (startDate) {
    const { error } = await supabaseAdmin
      .from("employees")
      .update({ hire_date: startDate })
      .eq("id", employeeId);
    if (error) console.warn("accept-invite: could not set hire_date", error.message);
  }

  // 2. PTO settings hire date (drives accrual tier). Only when we know a date.
  if (startDate) {
    const { error } = await supabaseAdmin
      .from("pto_settings")
      .upsert(
        { user_id: userId, org_id: orgId, employee_id: employeeId, hire_date: startDate },
        { onConflict: "user_id" },
      );
    if (error) console.warn("accept-invite: could not seed pto_settings", error.message);
  }

  // 3. Opening PTO balance as a snapshot anchor the engine recalculates from.
  const ptoHours =
    typeof invite.initial_pto_hours === "number" && Number.isFinite(invite.initial_pto_hours)
      ? invite.initial_pto_hours
      : null;
  if (ptoHours !== null) {
    const { error } = await supabaseAdmin
      .from("pto_snapshots")
      .upsert(
        {
          user_id: userId,
          org_id: orgId,
          employee_id: employeeId,
          snapshot_date: anchorDate,
          snapshot_balance_hours: ptoHours,
        },
        { onConflict: "user_id,snapshot_date" },
      );
    if (error) console.warn("accept-invite: could not seed pto_snapshot", error.message);
  }

  // 4. Starting weekly schedule → version + weekdays + assignment. DB triggers
  //    recompute attendance from these.
  const scheduleDays = sanitizeInviteSchedule(invite.weekly_schedule);
  if (scheduleDays.length > 0) {
    const { data: version, error: versionError } = await supabaseAdmin
      .from("schedule_versions")
      .insert({
        org_id: orgId,
        employee_id: employeeId,
        user_id: userId,
        name: "Starting schedule",
        effective_start_date: anchorDate,
        timezone,
        week_start_day: 1,
      })
      .select("id")
      .single();

    if (versionError || !version) {
      console.warn("accept-invite: could not create schedule version", versionError?.message);
    } else {
      const weekdayRows = scheduleDays.map((d) => ({
        schedule_version_id: version.id,
        weekday: d.weekday,
        enabled: true,
        start_time: d.start_time,
        end_time: d.end_time,
      }));
      const { error: weekdaysError } = await supabaseAdmin
        .from("schedule_weekdays")
        .insert(weekdayRows);
      if (weekdaysError) console.warn("accept-invite: could not add schedule weekdays", weekdaysError.message);

      const { error: assignError } = await supabaseAdmin
        .from("schedule_assignments")
        .insert({
          org_id: orgId,
          employee_id: employeeId,
          schedule_version_id: version.id,
          effective_start: anchorDate,
        });
      if (assignError) console.warn("accept-invite: could not assign schedule", assignError.message);
    }
  }
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

    // Seed hire date, PTO opening balance, and starting schedule from the invite
    // so tracking is correct from day one. Best-effort — never blocks joining.
    if (employeeId) {
      try {
        await applyOnboardingDetails(supabaseAdmin, invite, employeeId, user.id);
      } catch (detailsError) {
        console.warn(
          "accept-invite: could not apply onboarding details",
          detailsError instanceof Error ? detailsError.message : String(detailsError),
        );
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
    const message = e instanceof Error ? e.message : "Unexpected invite acceptance error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
