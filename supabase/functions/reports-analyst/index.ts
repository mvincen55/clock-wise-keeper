// reports-analyst — the AI reader over the accountability record book.
//
// Two actions, owner/manager only:
//   analyze — read every record in the selected range and report patterns,
//             concerns, and what looks fine. Receipts on every claim.
//   ask     — answer a specific question about the same set of records.
//
// Grounded strictly in the rows we hand it. No invention, no ranking people,
// no advice about discipline. Documentation, not punishment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { guardAiInput, JAILBREAK_REFUSAL } from "../_shared/jailbreak-guard.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// The record book deserves the strongest reasoning model we have.
const MODEL = "openai/gpt-5.5";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const KIND_LABELS: Record<string, string> = {
  tardy_threshold: "Tardiness",
  callout_threshold: "Call-outs",
  missed_punch_threshold: "Missed punches",
  checklist_bypass_threshold: "Checklist bypasses",
};

type Row = Record<string, unknown>;

function line(r: Row, who: string): string {
  const parts = [
    `[rec:${r.id}] ${who} · ${KIND_LABELS[String(r.kind)] ?? r.kind} · ${r.period_start} → ${r.period_end} · status ${r.status}`,
    `  summary: ${r.summary ?? "—"}`,
  ];

  if (r.member_reason) parts.push(`  member said: ${r.member_reason}`);
  if (r.manager_note) parts.push(`  reviewer note: ${r.manager_note}`);
  if (r.escalated_at) parts.push(`  escalated: ${String(r.escalated_at).slice(0, 10)}`);
  if (r.closed_at) parts.push(`  closed: ${String(r.closed_at).slice(0, 10)}`);
  return parts.join("\n");
}

const ANALYST_RULES = `YOU ARE READING THE ACCOUNTABILITY RECORD BOOK for a dental practice, for an owner or manager.

WHAT YOU DO:
- Find real patterns across the records you are given: repeats, clustering by weekday or month, recurring stated reasons, records that keep reopening, reviews that stalled or escalated.
- Separate "worth a look" from "this is normal". Most records are ordinary life — school, traffic, illness. Say so when that is what the data shows.
- Flag genuine concerns plainly: repeated same-kind records for one person in a short window, a stalled review, a pattern the office rules would want addressed.

CITATIONS — HARD RULE:
- Every factual claim must end with one or more citation tokens in this exact form: [rec:<the record id exactly as given>]
- Only ever cite ids that appear in the RECORDS block below. NEVER invent an id, a date, a name, a quote, or a record. If it is not in the RECORDS block, it does not exist.
- When you quote a person, quote the exact words from that record's "member said" or "reviewer note" line, and cite it.
- If you cannot support a statement with a real record id, do not make the statement.

HOW YOU ANSWER:
- Never rank people against each other, never score, never characterize anyone's character. Describe behavior and dates only.
- Never recommend discipline or consequences. You may suggest a conversation, a schedule check, or a policy clarification.
- Short. Markdown. Lead with the one thing that actually matters; skip padding.
- If nothing in the range needs attention, say exactly that in one or two lines.

FLAGGED CONCERNS — REQUIRED STRUCTURE:
After your prose, if (and only if) you flagged something worth a look, append one fenced json block, exactly like this and nothing after it:

\`\`\`json
{"concerns":[{"title":"short plain-English concern","confidence":"high|medium|low","confidence_reason":"one line on why the evidence is this strong or this thin","supports":["evidence that backs it, each with a real record id"],"weakens":["evidence that cuts against it, or context that makes it ordinary"],"record_ids":["<real record ids>"]}]}
\`\`\`

Rules for that block:
- confidence "high" = several records, consistent, clearly outside the ordinary. "medium" = a real pattern but thin data or a plausible ordinary explanation. "low" = a hunch worth a glance; say so.
- ALWAYS fill "weakens". If nothing genuinely weakens it, write what would change your mind or what data you cannot see. Never leave it empty.
- Every entry in supports/weakens must reference records you were given. No invented evidence.
- record_ids must be ids from the RECORDS block only.
- If nothing is worth flagging, omit the json block entirely.`;



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "analyze");
    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "";
    const kind = typeof body.kind === "string" && body.kind !== "all" ? body.kind : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    if (action === "ask" && !question) {
      return json({ error: "Ask me something about these records." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sign in to use the analyst." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: auth } = await asUser.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "Sign in to use the analyst." }, 401);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: member } = await db
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!member || !["owner", "manager"].includes(String(member.role))) {
      return json({ error: "Only a manager or the owner can read the record book." }, 403);
    }
    const orgId = String(member.org_id);

    if (
      action === "ask" &&
      (await guardAiInput({
        orgId,
        actorUserId: user.id,
        surface: "office-insights:reports-analyst",
        input: question,
      }))
    ) {
      return json({ answer: JAILBREAK_REFUSAL });
    }

    let q = db
      .from("accountability_reports")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(400);
    if (kind) q = q.eq("kind", kind);
    if (from) q = q.gte("period_start", from);
    if (to) q = q.lte("period_end", to);

    const { data: reports, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const rows = reports ?? [];
    if (rows.length === 0) {
      return json({
        answer: "No records in this range — nothing to read yet.",
        record_count: 0,
      });
    }

    const { data: employees } = await db
      .from("employees")
      .select("user_id, display_name, preferred_name")
      .eq("org_id", orgId);
    const nameByUser = new Map<string, string>();
    (employees ?? []).forEach((e: Row) => {
      if (e.user_id) {
        nameByUser.set(
          String(e.user_id),
          String(e.preferred_name || e.display_name || "Team member"),
        );
      }
    });

    const corpus = rows
      .map((r: Row) => line(r, nameByUser.get(String(r.subject_user_id ?? "")) ?? "Team member"))
      .join("\n\n");

    const range = `${from || "the beginning"} to ${to || "today"}${
      kind ? ` · kind: ${KIND_LABELS[kind] ?? kind}` : " · all kinds"
    }`;

    const task =
      action === "ask"
        ? `The manager asks: ${question}\n\nAnswer using only the records below.`
        : `Read the records below and give the manager a short read: patterns, anything worth a look, and what looks ordinary.`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured." }, 500);

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_completion_tokens: 1400,
        messages: [
          { role: "system", content: `${OFFICE_DOCTRINE}\n\n---\n\n${ANALYST_RULES}` },
          ...history
            .filter((m: Row) => m && (m.role === "user" || m.role === "assistant"))
            .map((m: Row) => ({ role: m.role, content: String(m.content ?? "").slice(0, 4000) })),
          {
            role: "user",
            content:
              `Range: ${range}\nRecords: ${rows.length}\n\n${task}\n\nRECORDS:\n${corpus}`,
          },
        ],
      }),
    });

    if (res.status === 429) {
      return json({ error: "The analyst is busy right now — try again in a minute." }, 429);
    }
    if (res.status === 402) {
      return json({ error: "AI credits are exhausted. Add credits to keep using the analyst." }, 402);
    }
    if (!res.ok) {
      const detail = await res.text();
      console.error("reports-analyst gateway error", res.status, detail);
      return json({ error: "The analyst could not read the records just now." }, 502);
    }

    const data = await res.json();
    let answer = data?.choices?.[0]?.message?.content?.trim() ||
      "Nothing stood out in this range.";

    const realIds = new Set(rows.map((r: Row) => String(r.id)));
    const cited = new Set<string>();

    // Pull the structured concerns block out of the prose.
    type Concern = {
      title: string;
      confidence: "high" | "medium" | "low";
      confidence_reason: string;
      supports: string[];
      weakens: string[];
      record_ids: string[];
    };
    let concerns: Concern[] = [];
    const block = answer.match(/```json\s*([\s\S]*?)```/);
    if (block) {
      answer = answer.replace(block[0], "").trim();
      try {
        const parsed = JSON.parse(block[1]);
        const list = Array.isArray(parsed?.concerns) ? parsed.concerns : [];
        concerns = list
          .map((c: Row) => {
            const conf = String(c.confidence ?? "low").toLowerCase();
            const ids = (Array.isArray(c.record_ids) ? c.record_ids : [])
              .map(String)
              // Anti-hallucination: a concern may only point at real records.
              .filter((id: string) => realIds.has(id));
            ids.forEach((id: string) => cited.add(id));
            return {
              title: String(c.title ?? "").slice(0, 300),
              confidence: (["high", "medium", "low"].includes(conf) ? conf : "low") as
                Concern["confidence"],
              confidence_reason: String(c.confidence_reason ?? ""),
              supports: (Array.isArray(c.supports) ? c.supports : []).map((s: unknown) =>
                String(s).slice(0, 500)
              ),
              weakens: (Array.isArray(c.weakens) ? c.weakens : []).map((s: unknown) =>
                String(s).slice(0, 500)
              ),
              record_ids: ids,
            };
          })
          // A concern with no real record behind it is not a concern.
          .filter((c: Concern) => c.title && c.record_ids.length > 0);
      } catch (err) {
        console.warn("reports-analyst could not parse concerns block", err);
      }
    }

    // Anti-hallucination: any cited id that is not a real row we handed the
    // model gets stripped out. The AI never gets to invent an entry.
    let dropped = 0;
    const scrub = (text: string) =>
      text.replace(/\[rec:\s*([0-9a-fA-F-]{6,})\s*\]/g, (_m: string, id: string) => {
        if (realIds.has(id)) {
          cited.add(id);
          return `[rec:${id}]`;
        }
        dropped++;
        return "";
      });

    answer = scrub(answer);
    concerns = concerns.map(c => ({
      ...c,
      supports: c.supports.map(scrub),
      weakens: c.weakens.map(scrub),
    }));

    if (dropped > 0) {
      console.warn("reports-analyst dropped fabricated citations", dropped);
      answer +=
        "\n\n_Some citations pointed at records that do not exist and were removed._";
    }

    const citations = rows
      .filter((r: Row) => cited.has(String(r.id)))
      .map((r: Row) => ({
        id: String(r.id),
        who: nameByUser.get(String(r.subject_user_id ?? "")) ?? "Team member",
        kind: String(r.kind),
        kind_label: KIND_LABELS[String(r.kind)] ?? String(r.kind),
        period_start: r.period_start,
        period_end: r.period_end,
        status: r.status,
        summary: r.summary ?? "",
        member_reason: r.member_reason ?? null,
        manager_note: r.manager_note ?? null,
        closed_at: r.closed_at ?? null,
      }));

    return json({ answer, concerns, citations, record_count: rows.length });


  } catch (e) {
    console.error("reports-analyst failed", e);
    return json({ error: "The analyst could not read the records just now." }, 500);
  }
});
