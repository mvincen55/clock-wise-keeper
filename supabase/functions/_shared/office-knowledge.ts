/**
 * OFFICE PROFILE — the one place the AI learns how THIS office is set up.
 *
 * The README's promise is that the AI *is* the office: its authoritative
 * world is the office's own rules, vocabulary, and configuration. Until now
 * each AI function hand-picked two or three tables and the rest of what a
 * manager configured on the Settings pages was invisible to every model.
 *
 * loadOfficeProfile reads the office's SETTINGS — practice identity, hours
 * of policy, payment policy, broken-appointment policy, correspondence
 * defaults, providers, team and roles, checklists, published procedures,
 * upcoming closures, and which reference numbers and letters exist — and
 * renders them as one compact, bounded text block for a system prompt.
 *
 * Boundaries, in order of importance:
 *   - Everything is read under the CALLER's JWT and filtered by org_id, so
 *     RLS and the explicit filter both scope it to one office.
 *   - No patient data: none of these tables hold any. Staff-authored free
 *     text (checklist titles, guidance, notes) still passes through the PHI
 *     scrubber by convention.
 *   - No secrets: Important Numbers are listed by LABEL only — the value
 *     (which may be a portal login, tax id, or account number) never leaves
 *     the app. Bank/deposit print settings are not read at all.
 *   - Bounded: every list is capped and the whole block is capped, so a
 *     large office never blows the prompt budget. Any read that fails is
 *     skipped silently — a missing section must never block an answer.
 */

import { scrubFreeText } from "./phi-scrub.ts";

// deno-lint-ignore no-explicit-any
type Client = { from: (table: string) => any };

export interface OfficeProfileOptions {
  /** Hard cap on the rendered block. */
  maxChars?: number;
  /** Include the team roster (names + roles). Off for surfaces that
   *  should not know who works there. */
  includeTeam?: boolean;
  /** Include FOF payment-policy details (plan, thresholds, discount rules). */
  includePaymentPolicy?: boolean;
}

const DEFAULTS: Required<OfficeProfileOptions> = {
  maxChars: 9000,
  includeTeam: true,
  includePaymentPolicy: true,
};

const one = (value: unknown, cap = 160): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";

/** Staff free text: scrubbed and flattened. */
const free = (value: unknown, cap = 200): string => one(scrubFreeText(value, cap).text, cap);

const money = (cents: unknown): string =>
  typeof cents === "number" && Number.isFinite(cents) ? `$${(cents / 100).toFixed(2)}` : "";

const dollars = (amount: unknown): string =>
  typeof amount === "number" && Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "";

// A read is a thunk so that building the query is guarded too: a client
// missing a builder method, a renamed column, or a network failure all
// resolve to "nothing known" for that section instead of failing the prompt.
// deno-lint-ignore no-explicit-any
async function safe<T>(build: () => PromiseLike<{ data: T | null; error?: any }>): Promise<T | null> {
  try {
    const r = await build();
    return r?.error ? null : (r?.data ?? null);
  } catch {
    return null;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Build the office profile block. Returns "" when nothing is configured so
 * callers can drop the section entirely.
 */
export async function loadOfficeProfile(
  supabase: Client,
  orgId: string,
  options: OfficeProfileOptions = {},
): Promise<string> {
  const opt = { ...DEFAULTS, ...options };
  const org = (table: string, select: string) => supabase.from(table).select(select).eq("org_id", orgId);

  const [
    branding,
    practice,
    attendance,
    payroll,
    brokenAppt,
    correspondence,
    fof,
    discounts,
    codeRules,
    guidance,
    providers,
    numbers,
    checklists,
    items,
    knowledge,
    employees,
    roles,
    closures,
    events,
    escalation,
    messaging,
    letters,
    consents,
  ] = await Promise.all([
    safe(() => org("org_branding", "display_name, legal_name, phone, website, address_line1, address_line2").maybeSingle()),
    safe(() => org("org_practice_settings", "pms_system, timezone, confirmation_lead_days, monthly_production_target_cents, monthly_collections_target_cents, monthly_new_patients_seen_target_count").maybeSingle()),
    safe(() => org("office_attendance_settings", "grace_minutes").maybeSingle()),
    safe(() => org("payroll_settings", "pay_period_type, week_start_day, missing_shift_buffer_minutes").order("updated_at", { ascending: false }).limit(1).maybeSingle()),
    safe(() => org("broken_appt_settings", "module_nav_label, notice_business_hours, fee_amount, history_window_years, vip_prepay_floor, signature_name, signature_title").maybeSingle()),
    safe(() => org("correspondence_settings", "default_closing, default_signer_name, default_signer_title, team_can_manage_templates").maybeSingle()),
    opt.includePaymentPolicy
      ? safe(() => org("fof_settings", "feature_display_name, print_form_title, membership_plan_name, payment_policy, day_of_service_threshold_cents, min_standalone_payment_cents, downgrade_default_on, doctor_names, doctor_name").maybeSingle())
      : Promise.resolve(null),
    opt.includePaymentPolicy
      ? safe(() => org("fof_discount_rules", "rule_key, enabled, percent, extra_percent, threshold_cents").limit(20))
      : Promise.resolve(null),
    opt.includePaymentPolicy ? safe(() => org("fof_code_rules", "code, kind").limit(60)) : Promise.resolve(null),
    safe(() => org("fof_ai_guidance", "content").eq("is_active", true).order("created_at", { ascending: true }).limit(30)),
    safe(() => org("org_providers", "display_name, provider_type, schedule_code").eq("active", true).order("sort_order").limit(20)),
    safe(() => org("important_numbers", "section, tab, label").order("section").order("sort_order").limit(80)),
    safe(() => org("checklists", "id, name, audience, owner_user_id").is("owner_user_id", null).order("sort_order").limit(20)),
    safe(() => org("checklist_items", "checklist_id, title, cadence, per_person, owner_user_id").eq("is_active", true).is("owner_user_id", null).order("sort_order").limit(120)),
    safe(() => org("knowledge_items", "title, kind, summary, current_published_version_id").not("current_published_version_id", "is", null).is("archived_at", null).order("title").limit(60)),
    opt.includeTeam
      ? safe(() => org("employees", "id, display_name, tag, team").eq("employment_status", "active").order("display_name").limit(60))
      : Promise.resolve(null),
    opt.includeTeam
      ? safe(() => org("employee_operational_roles", "employee_id, operational_role, is_primary, starts_on, ends_on").limit(200))
      : Promise.resolve(null),
    safe(() => org("office_closures", "closure_date, name, is_full_day").gte("closure_date", today()).lte("closure_date", plusDays(90)).order("closure_date").limit(20)),
    safe(() => org("office_events", "event_date, title, category, start_time").gte("event_date", today()).lte("event_date", plusDays(45)).order("event_date").limit(20)),
    safe(() => org("escalation_policies", "kind, threshold_count, threshold_window_days, reviewer_role, review_due_days, escalate_to, escalate_after_days").eq("is_active", true).limit(10)),
    safe(() => org("org_messaging_settings", "messages_label, requests_label, doctor_recipient_label, closeout_cutoff_minutes, closeout_item_enabled").maybeSingle()),
    safe(() => org("letter_templates", "title, category").eq("status", "active").order("title").limit(40)),
    safe(() => org("consent_forms", "name, category").eq("status", "published").order("name").limit(60)),
  ]);

  const sections: string[] = [];
  const push = (title: string, lines: string[]) => {
    const body = lines.filter(Boolean);
    if (body.length) sections.push(`${title}\n${body.map((l) => `- ${l}`).join("\n")}`);
  };

  // ---- Practice identity --------------------------------------------------
  {
    const b = (branding ?? {}) as Record<string, unknown>;
    const p = (practice ?? {}) as Record<string, unknown>;
    const name = one(b.display_name) || one(b.legal_name);
    const lines = [
      name ? `Practice: ${name}${one(b.legal_name) && one(b.legal_name) !== name ? ` (legal name ${one(b.legal_name)})` : ""}` : "",
      one(b.phone) ? `Phone: ${one(b.phone)}` : "",
      one(b.website) ? `Website: ${one(b.website)}` : "",
      [one(b.address_line1), one(b.address_line2)].filter(Boolean).length
        ? `Address: ${[one(b.address_line1), one(b.address_line2)].filter(Boolean).join(", ")}`
        : "",
      one(p.pms_system) ? `Practice-management system: ${one(p.pms_system)}` : "",
      one(p.timezone) ? `Office timezone: ${one(p.timezone)}` : "",
      typeof p.confirmation_lead_days === "number" ? `Appointment confirmation window: ${p.confirmation_lead_days} day(s) ahead` : "",
      money(p.monthly_production_target_cents) ? `Monthly production target: ${money(p.monthly_production_target_cents)}` : "",
      money(p.monthly_collections_target_cents) ? `Monthly collections target: ${money(p.monthly_collections_target_cents)}` : "",
      typeof p.monthly_new_patients_seen_target_count === "number" ? `Monthly new-patient target: ${p.monthly_new_patients_seen_target_count}` : "",
    ];
    push("PRACTICE", lines);
  }

  // ---- Providers ----------------------------------------------------------
  push(
    "PROVIDERS (doctors and hygienists on the schedule)",
    ((providers ?? []) as Record<string, unknown>[]).map((r) =>
      `${one(r.display_name, 80)}${one(r.provider_type) ? ` — ${one(r.provider_type)}` : ""}${one(r.schedule_code) ? ` (schedule code ${one(r.schedule_code, 20)})` : ""}`
    ),
  );

  // ---- Team ---------------------------------------------------------------
  if (opt.includeTeam) {
    const roleMap = new Map<string, string[]>();
    const now = today();
    for (const r of (roles ?? []) as Record<string, unknown>[]) {
      const starts = typeof r.starts_on === "string" ? r.starts_on : "";
      const ends = typeof r.ends_on === "string" ? r.ends_on : "";
      if (starts && starts > now) continue;
      if (ends && ends < now) continue;
      const list = roleMap.get(String(r.employee_id)) ?? [];
      list.push(`${one(r.operational_role, 40)}${r.is_primary ? " (primary)" : ""}`);
      roleMap.set(String(r.employee_id), list);
    }
    push(
      "TEAM (active staff; staff code in brackets)",
      ((employees ?? []) as Record<string, unknown>[]).map((e) => {
        const roleList = roleMap.get(String(e.id)) ?? [];
        return `${one(e.display_name, 80)}${one(e.tag) ? ` [${one(e.tag, 12)}]` : ""}${one(e.team) ? ` — ${one(e.team, 40)}` : ""}${roleList.length ? `: ${roleList.join(", ")}` : ""}`;
      }),
    );
  }

  // ---- Attendance & payroll policy ---------------------------------------
  {
    const a = (attendance ?? {}) as Record<string, unknown>;
    const pr = (payroll ?? {}) as Record<string, unknown>;
    const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    push("ATTENDANCE & PAYROLL POLICY", [
      typeof a.grace_minutes === "number" ? `Clock-in grace period: ${a.grace_minutes} minutes before a punch counts as late` : "",
      one(pr.pay_period_type) ? `Pay period: ${one(pr.pay_period_type)}` : "",
      typeof pr.week_start_day === "number" ? `Work week starts: ${weekday[pr.week_start_day] ?? pr.week_start_day}` : "",
      typeof pr.missing_shift_buffer_minutes === "number" ? `Missing-shift check: ${pr.missing_shift_buffer_minutes} minutes after a scheduled start with no punch` : "",
    ]);
  }

  // ---- Accountability -----------------------------------------------------
  push(
    "ACCOUNTABILITY POLICIES",
    ((escalation ?? []) as Record<string, unknown>[]).map((p) =>
      `${one(p.kind, 40)}: ${p.threshold_count} in ${p.threshold_window_days} days opens a record for the ${one(p.reviewer_role, 20)} (review due in ${p.review_due_days} days; escalates to ${one(p.escalate_to, 20) || "owner"} after ${p.escalate_after_days} more)`
    ),
  );

  // ---- Payment policy (FOF) ----------------------------------------------
  if (opt.includePaymentPolicy) {
    const f = (fof ?? {}) as Record<string, unknown>;
    const docs = Array.isArray(f.doctor_names) ? (f.doctor_names as unknown[]).map((d) => one(d, 60)).filter(Boolean) : [];
    const lines = [
      one(f.feature_display_name) ? `The financial form is called "${one(f.feature_display_name)}"${one(f.print_form_title) ? ` (prints as "${one(f.print_form_title)}")` : ""}` : "",
      one(f.membership_plan_name) ? `In-house membership plan: ${one(f.membership_plan_name)}` : "",
      docs.length ? `Doctors named on forms: ${docs.join(", ")}` : one(f.doctor_name) ? `Doctor named on forms: ${one(f.doctor_name)}` : "",
      money(f.day_of_service_threshold_cents) ? `Day-of-service threshold: ${money(f.day_of_service_threshold_cents)}` : "",
      money(f.min_standalone_payment_cents) ? `Minimum standalone payment: ${money(f.min_standalone_payment_cents)}` : "",
      typeof f.downgrade_default_on === "boolean" ? `Insurance downgrade line shown by default: ${f.downgrade_default_on ? "yes" : "no"}` : "",
      free(f.payment_policy, 1200) ? `Written payment policy: ${free(f.payment_policy, 1200)}` : "",
    ];
    for (const r of (discounts ?? []) as Record<string, unknown>[]) {
      if (!r.enabled) continue;
      lines.push(
        `Discount rule "${one(r.rule_key, 40)}": ${r.percent ?? 0}%${r.extra_percent ? ` (+${r.extra_percent}% extra)` : ""}${money(r.threshold_cents) ? ` from ${money(r.threshold_cents)}` : ""}`,
      );
    }
    const byKind = new Map<string, string[]>();
    for (const r of (codeRules ?? []) as Record<string, unknown>[]) {
      const k = one(r.kind, 30);
      byKind.set(k, [...(byKind.get(k) ?? []), one(r.code, 12)]);
    }
    for (const [kind, codes] of byKind) lines.push(`Codes marked ${kind}: ${codes.join(", ")}`);
    push("PAYMENT POLICY (Financial Options Form)", lines);
  }
  push(
    "STANDING WORDING RULES (how this office phrases patient-facing text)",
    ((guidance ?? []) as Record<string, unknown>[]).map((g) => free(g.content, 240)),
  );

  // ---- Broken appointments -----------------------------------------------
  {
    const b = (brokenAppt ?? {}) as Record<string, unknown>;
    push(`${one(b.module_nav_label) || "BROKEN APPOINTMENT"} POLICY`.toUpperCase(), [
      typeof b.notice_business_hours === "number" ? `Required notice: ${b.notice_business_hours} business hours` : "",
      dollars(b.fee_amount) ? `Fee: ${dollars(b.fee_amount)}` : "",
      typeof b.history_window_years === "number" ? `History counted over: ${b.history_window_years} year(s)` : "",
      dollars(b.vip_prepay_floor) ? `Prepayment floor for repeat offenders: ${dollars(b.vip_prepay_floor)}` : "",
      one(b.signature_name) ? `Letters signed by: ${one(b.signature_name)}${one(b.signature_title) ? `, ${one(b.signature_title)}` : ""}` : "",
    ]);
  }

  // ---- Correspondence -----------------------------------------------------
  {
    const c = (correspondence ?? {}) as Record<string, unknown>;
    const lines = [
      one(c.default_closing) ? `Default letter closing: "${one(c.default_closing)}"` : "",
      one(c.default_signer_name) ? `Office signer: ${one(c.default_signer_name)}${one(c.default_signer_title) ? `, ${one(c.default_signer_title)}` : ""}` : "",
      typeof c.team_can_manage_templates === "boolean" ? `Team may edit saved letters: ${c.team_can_manage_templates ? "yes" : "managers only"}` : "",
    ];
    const letterList = ((letters ?? []) as Record<string, unknown>[]).map((l) => `${free(l.title, 60)}${one(l.category) ? ` (${one(l.category, 30)})` : ""}`).filter(Boolean);
    if (letterList.length) lines.push(`Saved letters available: ${letterList.join("; ")}`);
    push("LETTERS & CORRESPONDENCE", lines);
  }

  // ---- Forms & consents ---------------------------------------------------
  push(
    "PUBLISHED CONSENT FORMS",
    (() => {
      const list = ((consents ?? []) as Record<string, unknown>[]).map((c) => `${free(c.name, 60)}${one(c.category) ? ` (${one(c.category, 30)})` : ""}`).filter(Boolean);
      return list.length ? [list.join("; ")] : [];
    })(),
  );

  // ---- Checklists ---------------------------------------------------------
  {
    const itemsBy = new Map<string, string[]>();
    for (const it of (items ?? []) as Record<string, unknown>[]) {
      const key = String(it.checklist_id);
      const title = free(it.title, 80);
      if (!title) continue;
      itemsBy.set(key, [...(itemsBy.get(key) ?? []), `${title} (${one(it.cadence, 10)}${it.per_person ? ", per person" : ""})`]);
    }
    push(
      "OFFICE CHECKLISTS (recurring duties)",
      ((checklists ?? []) as Record<string, unknown>[]).map((c) => {
        const list = itemsBy.get(String(c.id)) ?? [];
        return `${free(c.name, 60)}${c.audience === "manager" ? " [managers]" : ""}: ${list.length ? list.slice(0, 15).join("; ") : "no active items"}`;
      }),
    );
  }

  // ---- Published procedures & policies -----------------------------------
  push(
    "PUBLISHED HANDBOOK & PLAYBOOK ENTRIES (approved office policies/procedures; full text is searchable)",
    ((knowledge ?? []) as Record<string, unknown>[]).map((k) =>
      `${free(k.title, 80)}${one(k.kind) ? ` [${one(k.kind, 20)}]` : ""}${free(k.summary, 160) ? `: ${free(k.summary, 160)}` : ""}`
    ),
  );

  // ---- Reference directory (labels only) ---------------------------------
  {
    const bySection = new Map<string, string[]>();
    for (const n of (numbers ?? []) as Record<string, unknown>[]) {
      const section = one(n.tab, 40) || one(n.section, 40) || "General";
      bySection.set(section, [...(bySection.get(section) ?? []), free(n.label, 50)]);
    }
    push(
      "IMPORTANT NUMBERS DIRECTORY (entries by name only — values stay in the app; send people to Playbook → Important Numbers)",
      [...bySection].map(([section, labels]) => `${section}: ${labels.filter(Boolean).join(", ")}`),
    );
  }

  // ---- Calendar -----------------------------------------------------------
  push(
    "UPCOMING OFFICE CLOSURES (next 90 days)",
    ((closures ?? []) as Record<string, unknown>[]).map((c) => `${one(c.closure_date, 10)}: ${free(c.name, 60) || "closed"}${c.is_full_day === false ? " (partial day)" : ""}`),
  );
  push(
    "UPCOMING OFFICE EVENTS (next 45 days)",
    ((events ?? []) as Record<string, unknown>[]).map((e) => `${one(e.event_date, 10)}${one(e.start_time) ? ` ${one(e.start_time, 8)}` : ""}: ${free(e.title, 80)}${one(e.category) ? ` (${one(e.category, 30)})` : ""}`),
  );

  // ---- Messaging vocabulary ----------------------------------------------
  {
    const m = (messaging ?? {}) as Record<string, unknown>;
    push("APP VOCABULARY (this office's names for things)", [
      one(m.messages_label) ? `Messages are called "${one(m.messages_label)}"` : "",
      one(m.requests_label) ? `Doctor requests are called "${one(m.requests_label)}"` : "",
      one(m.doctor_recipient_label) ? `The doctor recipient is labeled "${one(m.doctor_recipient_label)}"` : "",
      m.closeout_item_enabled && typeof m.closeout_cutoff_minutes === "number" ? `End-of-day message closeout cutoff: ${m.closeout_cutoff_minutes} minutes` : "",
    ]);
  }

  if (!sections.length) return "";
  const block = sections.join("\n\n");
  return block.length > opt.maxChars ? `${block.slice(0, opt.maxChars - 1)}…` : block;
}

/** The framing sentence every consumer should put in front of the block. */
export const OFFICE_PROFILE_PREAMBLE =
  "OFFICE PROFILE — how this office is configured today, straight from its settings (authoritative; cite the setting when you rely on it; if something is not listed here, it is not configured — say so rather than guessing):";
