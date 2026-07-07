/**
 * RLS attack test — proves the lockdown at the API level (real JWT through
 * PostgREST), not just at the policy level.
 *
 * Signs in as a NON-ADMIN user and verifies:
 *   - clock-in survives the lockdown (INSERT time_entry + punch succeeds)
 *   - UPDATE/DELETE are dead for employees on punches, time_entries, audit_events
 *   - notifications can only be addressed to org admins
 *   - other employees' punches are invisible
 *   - punches cannot be forged for other employees
 *
 * Run:  npx tsx scripts/verify-rls.ts
 * Credentials are read from TEST_USER_EMAIL / TEST_USER_PASSWORD env vars,
 * or prompted interactively. Never hardcode credentials in this file.
 * Optional: OTHER_EMPLOYEE_ID — a different employee's uuid for the direct
 * cross-employee SELECT/forgery probes.
 *
 * Cleanup is admin work by design (employees can't delete anything):
 * the script prints the created row ids and the SQL to remove them; run it
 * via the Lovable MCP admin connection, then confirm the punch deletion
 * produced a trg_audit_punch_change row in audit_events.
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
  } catch { /* .env optional if env vars are set */ }
  return out;
}

const fileEnv = readEnvFile();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (env or .env)");
  process.exit(1);
}

type Result = { name: string; pass: boolean; detail: string };
const results: Result[] = [];
const record = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function getCredentials(): Promise<{ email: string; password: string }> {
  let email = process.env.TEST_USER_EMAIL;
  let password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    email = email || (await rl.question("Non-admin test user email: "));
    password = password || (await rl.question("Password: "));
    rl.close();
  }
  return { email, password };
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!);
  const { email, password } = await getCredentials();

  // --- 1. Sign in as non-admin ---
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr || !auth.user) {
    record("1. Sign in as non-admin", false, authErr?.message || "no user");
    printTable();
    process.exit(1);
  }
  const uid = auth.user.id;
  record("1. Sign in as non-admin", true, uid);

  // Resolve own employee + org, and confirm non-admin role
  const { data: emp } = await supabase.from("employees").select("id, org_id").eq("user_id", uid).limit(1).maybeSingle();
  if (!emp) {
    record("1b. Resolve own employee record", false, "no employees row for this user");
    printTable();
    process.exit(1);
  }
  const { data: membership } = await supabase.from("org_members").select("role").eq("user_id", uid).eq("org_id", emp.org_id).maybeSingle();
  const role = membership?.role ?? "(not visible)";
  record("1b. User is non-admin", !["owner", "manager"].includes(String(role)), `role=${role}`);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // --- 2. INSERT a punch (clock-in must survive the lockdown) ---
  let entryId: string | null = null;
  const { data: existingEntry } = await supabase.from("time_entries").select("id")
    .eq("employee_id", emp.id).eq("entry_date", today).maybeSingle();
  if (existingEntry) {
    entryId = existingEntry.id;
  } else {
    const { data: newEntry, error: entryErr } = await supabase.from("time_entries")
      .insert({ user_id: uid, org_id: emp.org_id, employee_id: emp.id, entry_date: today, source: "manual" })
      .select("id").single();
    record("2a. INSERT own time_entry", !entryErr && !!newEntry, entryErr?.message || newEntry?.id || "");
    entryId = newEntry?.id ?? null;
  }
  if (!entryId) { printTable(); process.exit(1); }

  const { data: maxP } = await supabase.from("punches").select("seq")
    .eq("time_entry_id", entryId).order("seq", { ascending: false }).limit(1).maybeSingle();
  const punchTime = new Date().toISOString();
  const { data: punch, error: punchErr } = await supabase.from("punches").insert({
    time_entry_id: entryId, org_id: emp.org_id, employee_id: emp.id,
    seq: (maxP?.seq ?? -1) + 1, punch_type: "in", punch_time: punchTime, source: "manual",
  }).select("id").single();
  record("2b. INSERT own punch (clock-in)", !punchErr && !!punch, punchErr?.message || punch?.id || "");
  const punchId = punch?.id;

  // --- 3. UPDATE / DELETE must be dead (assert 0 rows affected on all six) ---
  if (punchId) {
    const { data: u1, error: e1 } = await supabase.from("punches")
      .update({ punch_time: "2026-01-01T12:00:00Z" }).eq("id", punchId).select("id");
    record("3a. UPDATE own punch → 0 rows", !!e1 || (u1 ?? []).length === 0, e1?.message || `${(u1 ?? []).length} rows`);
    const { data: d1, error: e2 } = await supabase.from("punches").delete().eq("id", punchId).select("id");
    record("3b. DELETE own punch → 0 rows", !!e2 || (d1 ?? []).length === 0, e2?.message || `${(d1 ?? []).length} rows`);
  }
  const { data: u2, error: e3 } = await supabase.from("time_entries")
    .update({ total_minutes: 9999 }).eq("id", entryId).select("id");
  record("3c. UPDATE own time_entry → 0 rows", !!e3 || (u2 ?? []).length === 0, e3?.message || `${(u2 ?? []).length} rows`);
  const { data: d2, error: e4 } = await supabase.from("time_entries").delete().eq("id", entryId).select("id");
  record("3d. DELETE own time_entry → 0 rows", !!e4 || (d2 ?? []).length === 0, e4?.message || `${(d2 ?? []).length} rows`);

  // Employees may INSERT audit events (that's how clock-ins log themselves) —
  // create one, then verify it can never be altered or removed.
  const { data: ownAudit, error: auditInsErr } = await supabase.from("audit_events").insert({
    user_id: uid, org_id: emp.org_id, employee_id: emp.id, actor_id: uid,
    event_type: "rls_test_probe", event_details: { note: "created by verify-rls.ts" },
  }).select("id").single();
  record("3e-pre. INSERT own audit_event", !auditInsErr && !!ownAudit, auditInsErr?.message || ownAudit?.id || "");
  const auditRows = ownAudit ? [ownAudit] : (await supabase.from("audit_events").select("id").limit(1)).data;
  if (auditRows?.length) {
    const aid = auditRows[0].id;
    const { data: u3, error: e5 } = await supabase.from("audit_events")
      .update({ event_type: "tampered" }).eq("id", aid).select("id");
    record("3e. UPDATE audit_event → 0 rows", !!e5 || (u3 ?? []).length === 0, e5?.message || `${(u3 ?? []).length} rows`);
    const { data: d3, error: e6 } = await supabase.from("audit_events").delete().eq("id", aid).select("id");
    record("3f. DELETE audit_event → 0 rows", !!e6 || (d3 ?? []).length === 0, e6?.message || `${(d3 ?? []).length} rows`);
  } else {
    record("3e/3f. UPDATE/DELETE audit_event", false, "no visible audit row to attack — insert one first");
  }

  // --- 4. Notification addressed to a NON-admin must be rejected ---
  const { error: notifErr } = await supabase.from("notifications").insert({
    org_id: emp.org_id, recipient_user_id: uid, // self = non-admin recipient
    notification_type: "rls_test", title: "rls-test", message: "should be rejected",
  });
  record("4. INSERT notification → non-admin recipient rejected", !!notifErr, notifErr?.message || "insert unexpectedly succeeded");

  // --- 5. Another employee's punches must be invisible / unforgeable ---
  const { data: allPunches } = await supabase.from("punches").select("id, employee_id");
  const foreign = (allPunches ?? []).filter(p => p.employee_id !== emp.id);
  record("5a. SELECT punches — only own visible", foreign.length === 0, `${foreign.length} foreign rows visible of ${(allPunches ?? []).length}`);

  const otherEmployeeId = process.env.OTHER_EMPLOYEE_ID;
  if (otherEmployeeId) {
    const { data: otherPunches } = await supabase.from("punches").select("id").eq("employee_id", otherEmployeeId);
    record("5b. SELECT other employee's punches → 0 rows", (otherPunches ?? []).length === 0, `${(otherPunches ?? []).length} rows`);
    const { error: forgeErr } = await supabase.from("punches").insert({
      time_entry_id: entryId, org_id: emp.org_id, employee_id: otherEmployeeId,
      seq: 999, punch_type: "in", punch_time: new Date().toISOString(), source: "manual",
    });
    record("5c. INSERT punch for other employee rejected", !!forgeErr, forgeErr?.message || "forgery unexpectedly succeeded");
  } else {
    console.log("      (set OTHER_EMPLOYEE_ID to run direct cross-employee probes 5b/5c)");
  }

  printTable();

  console.log(`
Admin cleanup (run via the Lovable MCP admin SQL — employees cannot delete):
  DELETE FROM punches WHERE id = '${punchId}';
  -- then confirm the audit trigger fired on that deletion:
  SELECT event_type, target_id FROM audit_events
   WHERE target_table = 'punches' AND target_id = '${punchId}' AND event_type = 'punch_deleted';
  DELETE FROM time_entries WHERE id = '${entryId}';  -- if created solely for this test
`);
  process.exit(results.every(r => r.pass) ? 0 : 1);
}

function printTable() {
  const w = Math.max(...results.map(r => r.name.length)) + 2;
  console.log("\n" + "=".repeat(w + 30));
  console.log("RLS ATTACK TEST RESULTS");
  console.log("=".repeat(w + 30));
  for (const r of results) {
    console.log(`${r.pass ? "✅ PASS" : "❌ FAIL"}  ${r.name.padEnd(w)} ${r.detail}`);
  }
  const passed = results.filter(r => r.pass).length;
  console.log("-".repeat(w + 30));
  console.log(`${passed}/${results.length} checks passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
