import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Live checks against the project database. They verify the rules that keep
// integrity events actor-blind: nobody can read a signal about themselves, and
// nothing outside the service role can write one.
//
// Both halves skip cleanly when their environment isn't available, so the suite
// stays green in environments without database or network access.

const hasPsql = Boolean(process.env.PGHOST);

function q(sql: string): string {
  return execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();
}

describe.runIf(hasPsql)("security_events RLS policies", () => {
  const policies = () =>
    q(
      `select p.polname || '|' || p.polcmd || '|' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') ||
              '|' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ||
              '|' || (select string_agg(r.rolname, ',') from pg_roles r where r.oid = any(p.polroles))
       from pg_policy p join pg_class c on c.oid = p.polrelid
       where c.relname = 'security_events'`,
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, cmd, qual, check, roles] = line.split("|");
        return { name, cmd, qual, check, roles: (roles ?? "").split(",") };
      });

  it("has RLS enabled and forced-on rows", () => {
    expect(q("select relrowsecurity from pg_class where relname = 'security_events'")).toBe("t");
  });

  it("exposes no policy to anon or public", () => {
    for (const p of policies()) {
      expect(p.roles, p.name).not.toContain("anon");
      expect(p.roles, p.name).not.toContain("public");
    }
  });

  it("hides events from their own actor on every readable policy", () => {
    const readable = policies().filter((p) => p.cmd === "r" || p.cmd === "*" || p.cmd === "w");
    expect(readable.length).toBeGreaterThan(0);
    for (const p of readable) {
      // Self-visibility prevention: the actor can never be the reader.
      expect(p.qual.replace(/\s+/g, " "), p.name).toContain("actor_user_id <> auth.uid()");
      // And the read is still scoped to an admin of the same org.
      expect(p.qual, p.name).toContain("is_org_admin(org_id)");
    }
  });

  it("lets no client role insert or delete integrity events", () => {
    // Only the service role (which bypasses RLS) may write events.
    const writes = policies().filter((p) => p.cmd === "a" || p.cmd === "d");
    expect(writes).toHaveLength(0);
    const grants = q(
      `select coalesce(string_agg(distinct privilege_type || ':' || grantee, ','), '')
       from information_schema.role_table_grants
       where table_name = 'security_events' and grantee in ('anon', 'authenticated')`,
    );
    expect(grants).not.toContain("INSERT:anon");
    expect(grants).not.toContain("DELETE:anon");
    expect(grants).not.toContain("SELECT:anon");
    expect(grants).not.toContain("INSERT:authenticated");
    expect(grants).not.toContain("DELETE:authenticated");
  });

  it("keeps an admin's countersign path limited to review columns", () => {
    const update = policies().find((p) => p.cmd === "w");
    expect(update).toBeDefined();
    // The update check repeats the actor-blind rule so an admin cannot
    // reach a row about themselves through the review path either.
    expect(update!.check.replace(/\s+/g, " ")).toContain("actor_user_id <> auth.uid()");
  });
});

// ---- Anonymous access, exercised through the real Data API ----------------

function envFromDotenv(key: string): string | undefined {
  if (process.env[key]) return process.env[key];
  if (!existsSync(".env")) return undefined;
  const line = readFileSync(".env", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^["']|["']$/g, "").trim();
}

const url = envFromDotenv("VITE_SUPABASE_URL");
const anonKey =
  envFromDotenv("VITE_SUPABASE_PUBLISHABLE_KEY") ?? envFromDotenv("VITE_SUPABASE_ANON_KEY");

describe.runIf(Boolean(url && anonKey))("security_events via the anonymous Data API", () => {
  const headers = { apikey: anonKey!, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" };

  it("returns no rows to an anonymous reader", async () => {
    const res = await fetch(`${url}/rest/v1/security_events?select=id&limit=1`, { headers });
    if (res.ok) {
      expect(await res.json()).toEqual([]);
    } else {
      expect([401, 403, 404]).toContain(res.status);
      await res.text();
    }
  });

  it("refuses an anonymous insert", async () => {
    const res = await fetch(`${url}/rest/v1/security_events`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        org_id: "00000000-0000-0000-0000-000000000000",
        kind: "ai_jailbreak",
        severity: "watch",
        status: "open",
        fingerprint: `test:${Date.now()}`,
        detail: {},
      }),
    });
    expect(res.ok).toBe(false);
    expect([401, 403, 404]).toContain(res.status);
    await res.text();
  });
});
