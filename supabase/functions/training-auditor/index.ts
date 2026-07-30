// training-auditor — a second pair of eyes on a training module before the
// office relies on it.
//
// It reads the module against the office's own standing rules (assistant_memories)
// and its policy corpus (office_docs), and records anything that contradicts
// them, reads as unsafe/inappropriate, or is factually wrong.
//
// Rules of the road:
//   • FAIL OPEN. A review that cannot run must never block publishing a module.
//     Every failure path returns 200 with an empty finding list.
//   • Findings are fingerprinted, so re-running the auditor on the same module
//     never piles up duplicates.
//   • Only owners and managers ever read the findings (enforced by RLS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Quality first — the strongest model available on the gateway.
const MODEL = "openai/gpt-5.6-sol";

const MAX_CORPUS_CHARS = 20000;

const text = (v: unknown, cap: number): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, cap) : "";

function parseJsonBlock<T>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/** Stable FNV-1a fingerprint so the same issue is only ever recorded once. */
function fingerprint(parts: string[]): string {
  const input = parts.join("|").toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

type Finding = {
  severity: string;
  category: string;
  quote: string;
  note: string;
  suggested_fix: string;
};

const SEVERITIES = new Set(["critical", "warning", "info"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Everything below is best-effort: the module stays published no matter what.
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, findings: [] }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ ok: false, findings: [] }, 401);

    const body = (await req.json().catch(() => ({}))) as { moduleId?: string };
    const moduleId = text(body.moduleId, 40);
    if (!moduleId) return json({ ok: false, findings: [] }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: module } = await admin
      .from("training_modules")
      .select("id, org_id, title, summary, content, audience_tags")
      .eq("id", moduleId)
      .maybeSingle();
    if (!module) return json({ ok: true, findings: [] });

    // Caller must be an owner or manager of the module's office.
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("org_id", module.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const role = (membership?.role as string | undefined) ?? "";
    if (role !== "owner" && role !== "manager") return json({ ok: false, findings: [] }, 403);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ ok: true, findings: [], skipped: "no_model" });

    // ---- Grounding: the office's own rules come first ----
    const { data: memories } = await admin
      .from("assistant_memories")
      .select("content")
      .eq("org_id", module.org_id)
      .limit(80);
    const rules = (memories ?? [])
      .map((m) => text((m as { content?: unknown }).content, 400))
      .filter(Boolean)
      .join("\n- ");

    const { data: docs } = await admin
      .from("office_docs")
      .select("title, category")
      .eq("org_id", module.org_id)
      .limit(40);
    const docList = (docs ?? [])
      .map((d) => `${text((d as { title?: unknown }).title, 120)} (${text((d as { category?: unknown }).category, 40)})`)
      .join("; ");

    const { data: chunks } = await admin
      .from("office_doc_chunks")
      .select("content")
      .limit(40);
    const corpus = (chunks ?? [])
      .map((c) => text((c as { content?: unknown }).content, 1200))
      .join("\n")
      .slice(0, MAX_CORPUS_CHARS);

    const moduleText = JSON.stringify({
      title: module.title,
      summary: module.summary,
      audience: module.audience_tags,
      content: module.content,
    }).slice(0, 40000);

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You review a dental practice's internal training module before the team relies on it. " +
              "The office's own standing rules are the highest authority: anything in the module that contradicts them is a finding, even if the module's advice is good general practice. " +
              "Also flag anything unsafe, discriminatory, legally risky, clinically wrong, that names a real patient, or that a quiz marks as correct when it is not. " +
              "Be conservative: no finding for tone, wording taste, or formatting. If the module is fine, return an empty list. " +
              'Reply with ONLY JSON: {"findings":[{"severity":"critical"|"warning"|"info","category":string,"quote":string,"note":string,"suggested_fix":string}]}',
          },
          {
            role: "user",
            content: [
              `Office standing rules:\n- ${rules || "(none recorded)"}`,
              `Policy documents on file: ${docList || "(none)"}`,
              `Policy excerpts:\n${corpus || "(none)"}`,
              `Module under review:\n${moduleText}`,
            ].join("\n\n"),
          },
        ],
        max_completion_tokens: 1500,
      }),
    });

    if (!response.ok) return json({ ok: true, findings: [], skipped: "model_unavailable" });
    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) return json({ ok: true, findings: [] });

    const parsed = parseJsonBlock<{ findings?: unknown }>(raw);
    const list = Array.isArray(parsed?.findings) ? parsed!.findings : [];

    const findings: Finding[] = list
      .slice(0, 20)
      .map((f) => {
        const r = (f ?? {}) as Record<string, unknown>;
        const severity = text(r.severity, 20).toLowerCase();
        return {
          severity: SEVERITIES.has(severity) ? severity : "warning",
          category: text(r.category, 60) || "other",
          quote: text(r.quote, 400),
          note: text(r.note, 600),
          suggested_fix: text(r.suggested_fix, 600),
        };
      })
      .filter((f) => f.note);

    if (findings.length) {
      const rows = findings.map((f) => ({
        org_id: module.org_id,
        module_id: module.id,
        fingerprint: fingerprint([f.category, f.quote, f.note]),
        severity: f.severity,
        category: f.category,
        quote: f.quote,
        note: f.note,
        suggested_fix: f.suggested_fix,
        created_by: user.id,
      }));
      await admin
        .from("training_audit_findings")
        .upsert(rows, { onConflict: "module_id,fingerprint", ignoreDuplicates: true });
    }

    return json({ ok: true, findings });
  } catch (_err) {
    // Fail open — never block a module on a broken review.
    return json({ ok: true, findings: [], skipped: "error" });
  }
});
