/**
 * Employee-experience verification — proves every self-serve flow an employee
 * uses day-to-day actually works through the real API (real JWT via PostgREST),
 * and that the guard triggers still block payroll-relevant fields.
 *
 * Model under test ("safe fields self-serve, rest via request"):
 *   CAN:    clock in/out; toggle remote; save daily comment; add tardy reason;
 *           create+resolve missing-shift exceptions; submit correction requests;
 *           notify admins; read org-wide office closures.
 *   CANNOT: change total_minutes / tardy minutes / approval status;
 *           write schedules, closures, payroll settings/summaries.
 *
 * Run:  npx tsx scripts/verify-employee-flows.ts
 * Credentials via TEST_USER_EMAIL / TEST_USER_PASSWORD env vars or prompt.
 * Optional: ADMIN_USER_ID (to test employee→admin notification),
 *           ORG_CLOSURE_DATE (a date that has an admin-created org closure).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* .env optional */ }
  return out;
}

const fileEnv = readEnvFile();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];
const record = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!);

  let email = process.env.TEST_USER_EMAIL;
  let password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    email = email || (await rl.question("Non-admin test user email: "));
    password = password || (await rl.question("Password: "));
    rl.close();
  }

  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr || !auth.user) {
    record("Sign in", false, authErr?.message || "no user");
    printTable(); process.exit(1);
  }
  const uid = auth.user.id;
  record("Sign in as employee", true, uid);

  const { data: emp } = await supabase.from("employees").select("id, org_id").eq("user_id", uid).limit(1).maybeSingle();
  if (!emp) { record("Resolve employee record", false, "none"); printTable(); process.exit(1); }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // --- Clock in/out and trigger-owned totals ---
  let entryId: string;
  const { data: existingEntry } = await supabase.from("time_entries").select("id")
    .eq("employee_id", emp.id).eq("entry_date", today).maybeSingle();
  if (existingEntry) {
    entryId = existingEntry.id;
  } else {
    const { data: newEntry, error: entryErr } = await supabase.from("time_entries")
      .insert({ user_id: uid, org_id: emp.org_id, employee_id: emp.id, entry_date: today, source: "manual" })
      .select("id").single();
    if (entryErr || !newEntry) { record("Create today's entry", false, entryErr?.message || ""); printTable(); process.exit(1); }
    entryId = newEntry.id;
  }

  const inTime = new Date(Date.now() - 2 * 3600_000).toISOString();
  const outTime = new Date().toISOString();
  const { error: pinErr } = await supabase.from("punches").insert([
    { time_entry_id: entryId, org_id: emp.org_id, employee_id: emp.id, seq: 0, punch_type: "in", punch_time: inTime, source: "manual" },
    { time_entry_id: entryId, org_id: emp.org_id, employee_id: emp.id, seq: 1, punch_type: "out", punch_time: outTime, source: "manual" },
  ]);
  record("1. Clock in + out (INSERT punches)", !pinErr, pinErr?.message || "in/out pair inserted");

  // total_minutes must be recomputed by the DB trigger (SECURITY DEFINER must
  // pass through the new guard trigger — this is the critical regression check)
  const { data: entryAfter } = await supabase.from("time_entries").select("total_minutes").eq("id", entryId).single();
  const totalOk = entryAfter != null && Math.abs((entryAfter.total_minutes ?? 0) - 120) <= 1;
  record("2. total_minutes recomputed by trigger", totalOk, `total_minutes=${entryAfter?.total_minutes}`);

  // --- Safe self-serve fields on time_entries ---
  const { data: u1, error: e1 } = await supabase.from("time_entries")
    .update({ is_remote: true }).eq("id", entryId).select("id");
  record("3. Toggle remote flag → allowed", !e1 && (u1 ?? []).length === 1, e1?.message || `${(u1 ?? []).length} row`);

  const { data: u2, error: e2 } = await supabase.from("time_entries")
    .update({ entry_comment: "left early for dentist appt" }).eq("id", entryId).select("id");
  record("4. Save daily comment → allowed", !e2 && (u2 ?? []).length === 1, e2?.message || `${(u2 ?? []).length} row`);

  const { error: e3 } = await supabase.from("time_entries")
    .update({ total_minutes: 9999 }).eq("id", entryId).select("id");
  record("5. Change total_minutes → blocked by guard", !!e3, e3?.message || "unexpectedly succeeded");

  // --- Missing-shift exception lifecycle ---
  const excDate = "2020-02-03";
  const { data: exc, error: excErr } = await supabase.from("attendance_exceptions").insert({
    user_id: uid, org_id: emp.org_id, employee_id: emp.id,
    exception_date: excDate, type: "missing_shift", status: "open",
  }).select("id").single();
  record("6. Create missing-shift exception", !excErr && !!exc, excErr?.message || exc?.id || "");

  if (exc) {
    const { data: ru, error: rErr } = await supabase.from("attendance_exceptions").update({
      status: "resolved", reason_text: "was at offsite training", resolution_action: "manual_punches_added",
      resolved_at: new Date().toISOString(),
    }).eq("id", exc.id).select("id, status");
    record("7. Resolve own exception → allowed", !rErr && (ru ?? []).length === 1, rErr?.message || `${(ru ?? []).length} row`);
  }

  // --- Tardy reason (allowed) vs tardy tampering (blocked) ---
  // NOTE: employee-inserted tardies on unscheduled dates are auto-deleted by the
  // recompute trigger (self-healing) — so guard tests run against a REAL tardy
  // row. Provide one via TEST_TARDY_ID (admin-seeded, approval_status != 'unreviewed'
  // so recompute keeps it), or the script finds any visible tardy for this user.
  const tardyId = process.env.TEST_TARDY_ID
    || (await supabase.from("tardies").select("id").eq("user_id", uid).limit(1).maybeSingle()).data?.id;
  if (tardyId) {
    const { data: tu, error: tuErr } = await supabase.from("tardies")
      .update({ reason_text: "traffic on 128" }).eq("id", tardyId).select("id");
    record("9. Add tardy reason → allowed", !tuErr && (tu ?? []).length === 1, tuErr?.message || `${(tu ?? []).length} row`);

    const { error: tampErr } = await supabase.from("tardies")
      .update({ minutes_late: 0 }).eq("id", tardyId).select("id");
    record("10. Reduce minutes_late → blocked by guard", !!tampErr, tampErr?.message || "unexpectedly succeeded");

    const { error: apprErr } = await supabase.from("tardies")
      .update({ approval_status: "approved" }).eq("id", tardyId).select("id");
    record("11. Self-approve tardy → blocked by guard", !!apprErr, apprErr?.message || "unexpectedly succeeded");
  } else {
    record("9-11. Tardy guard tests", false, "no tardy row available — seed one and pass TEST_TARDY_ID");
  }

  // --- Attendance inputs are read-only for employees ---
  const { error: wsErr } = await supabase.from("work_schedule").insert({
    user_id: uid, weekday: 1, start_time: "12:00", end_time: "12:30", enabled: true,
  });
  record("12. Write own work_schedule → rejected", !!wsErr, wsErr?.message || "unexpectedly succeeded");

  const { error: svErr } = await supabase.from("schedule_versions").insert({
    user_id: uid, org_id: emp.org_id, employee_id: emp.id, name: "hax", effective_start_date: "2020-01-01",
  });
  record("13. Write own schedule_version → rejected", !!svErr, svErr?.message || "unexpectedly succeeded");

  const { error: ocErr } = await supabase.from("office_closures").insert({
    user_id: uid, org_id: emp.org_id, employee_id: emp.id, closure_date: today, name: "fake holiday",
  });
  record("14. Write office_closure → rejected", !!ocErr, ocErr?.message || "unexpectedly succeeded");

  const closureDate = process.env.ORG_CLOSURE_DATE;
  if (closureDate) {
    const { data: orgClosures } = await supabase.from("office_closures").select("id, name").eq("closure_date", closureDate);
    record("15. Read org-wide closure → visible", (orgClosures ?? []).length > 0, `${(orgClosures ?? []).length} row(s)`);
  }

  const { error: psErr } = await supabase.from("payroll_settings").upsert(
    { user_id: uid, org_id: emp.org_id, missing_shift_buffer_minutes: 99999 }, { onConflict: "user_id" });
  record("16. Write payroll_settings → rejected", !!psErr, psErr?.message || "unexpectedly succeeded");

  const { error: sumErr } = await supabase.from("payroll_summaries").insert({
    user_id: uid, org_id: emp.org_id, range_start: "2020-01-01", range_end: "2020-01-15", total_minutes: 48000,
  });
  record("17. Forge payroll_summary → rejected", !!sumErr, sumErr?.message || "unexpectedly succeeded");

  // --- Request + notify pipeline ---
  const { data: admins } = await supabase.from("org_members").select("user_id, role")
    .eq("org_id", emp.org_id).in("role", ["owner", "manager"]).eq("status", "active");
  record("18. Employee can discover org admins", (admins ?? []).length > 0, `${(admins ?? []).length} admin(s) visible`);

  const { data: cr, error: crErr } = await supabase.from("correction_requests").insert({
    org_id: emp.org_id, employee_id: emp.id, created_by: uid,
    target_table: "time_entries", target_id: entryId,
    proposed_change: { punch_fix: "clock-in should be 8:00 AM" }, reason: "forgot to punch in on arrival",
  }).select("id").single();
  record("19. Submit correction request", !crErr && !!cr, crErr?.message || cr?.id || "");

  const adminId = process.env.ADMIN_USER_ID || (admins ?? [])[0]?.user_id;
  if (adminId) {
    // No .select() after insert: the sender cannot read the recipient's
    // notification back (SELECT is recipient-only), and INSERT..RETURNING
    // would fail on that. The app's createNotification() inserts the same way.
    const { error: nErr } = await supabase.from("notifications").insert({
      org_id: emp.org_id, recipient_user_id: adminId, actor_user_id: uid,
      notification_type: "correction_request_new", title: "New Correction Request",
      message: "verify-employee-flows test notification",
    });
    record("20. Notify admin of request → allowed", !nErr, nErr?.message || "inserted");
  }

  printTable();

  console.log(`
Admin cleanup (via Lovable MCP admin SQL):
  DELETE FROM correction_requests WHERE created_by = '${uid}';
  DELETE FROM notifications WHERE actor_user_id = '${uid}' OR recipient_user_id = '${uid}';
  DELETE FROM tardies WHERE user_id = '${uid}';
  DELETE FROM attendance_exceptions WHERE user_id = '${uid}';
  DELETE FROM punches WHERE employee_id = '${emp.id}';
  DELETE FROM time_entries WHERE user_id = '${uid}';
  DELETE FROM attendance_day_status WHERE user_id = '${uid}';
`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
}

function printTable() {
  const w = Math.max(...results.map(r => r.name.length)) + 2;
  console.log("\n" + "=".repeat(w + 30));
  console.log("EMPLOYEE FLOW VERIFICATION");
  console.log("=".repeat(w + 30));
  for (const r of results) {
    console.log(`${r.pass ? "✅ PASS" : "❌ FAIL"}  ${r.name.padEnd(w)} ${r.detail}`);
  }
  console.log("-".repeat(w + 30));
  console.log(`${results.filter(r => r.pass).length}/${results.length} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
