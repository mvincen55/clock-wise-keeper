// training-builder — writes a training module grounded in how THIS office runs.
//
// Grounding sources, in authority order:
//   1. assistant_memories  — standing facts/rules the office taught the assistant.
//                            Authoritative. The module must never contradict them.
//   2. office_docs corpus  — policy manual, HR, procedures (same FTS corpus ask-docs uses).
//   3. org settings        — practice/branding/FOF configuration the doctor set up.
//
// The rules of the office are the rules of the world: no generic internet advice
// that conflicts with office policy, fictional scenarios only (never real patient
// data), concrete dental front-office situations, and every section ends with a
// "try it today" action.

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

const MAX_DOC_CHARS = 30000;

type QuizQuestion = { q: string; options: string[]; correct_index: number; why: string };
type Section = { heading: string; body: string; try_it: string };
type ModuleContent = {
  outcome: string;
  sections: Section[];
  recap: string;
  quiz: { questions: QuizQuestion[] } | null;
};

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

/** Coerce the model output into the exact content shape the app renders. */
function normalizeContent(raw: unknown): ModuleContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const sections: Section[] = Array.isArray(r.sections)
    ? (r.sections as Record<string, unknown>[])
        .map((s) => ({
          heading: text(s?.heading, 160),
          body: typeof s?.body === "string" ? s.body.trim().slice(0, 4000) : "",
          try_it: text(s?.try_it, 500),
        }))
        .filter((s) => s.heading && s.body && s.try_it)
        .slice(0, 8)
    : [];
  if (sections.length === 0) return null;

  const rawQuiz = r.quiz as Record<string, unknown> | null | undefined;
  let quiz: ModuleContent["quiz"] = null;
  if (rawQuiz && Array.isArray(rawQuiz.questions)) {
    const questions = (rawQuiz.questions as Record<string, unknown>[])
      .map((q) => {
        const options = Array.isArray(q?.options)
          ? (q.options as unknown[]).map((o) => text(o, 300)).filter(Boolean).slice(0, 5)
          : [];
        const idx = Number(q?.correct_index);
        return {
          q: text(q?.q, 600),
          options,
          correct_index: Number.isInteger(idx) && idx >= 0 && idx < options.length ? idx : 0,
          why: text(q?.why, 800),
        };
      })
      .filter((q) => q.q && q.options.length >= 2 && q.why)
      .slice(0, 10);
    if (questions.length > 0) quiz = { questions };
  }

  return {
    outcome: text(r.outcome, 600),
    sections,
    recap: text(r.recap, 1500),
    quiz,
  };
}

/** Short FTS queries over the office corpus, derived from the topic + audience. */
function searchTerms(topic: string, audience: string[]): string[] {
  const words = `${topic} ${audience.join(" ")}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const terms = new Set<string>();
  for (let i = 0; i < words.length; i += 1) {
    terms.add(words[i]);
    if (words[i + 1]) terms.add(`${words[i]} ${words[i + 1]}`);
  }
  return [...terms].slice(0, 8);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: auth, error: authError } = await supabase.auth.getUser();
    const user = auth?.user;
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const topic = text(body?.topic, 400);
    const audience: string[] = Array.isArray(body?.audience)
      ? body.audience.map((a: unknown) => text(a, 60)).filter(Boolean).slice(0, 8)
      : [];
    const originGoalId = typeof body?.origin_goal_id === "string" ? body.origin_goal_id : null;
    const STYLES = ["visual", "auditory", "reading", "kinesthetic", "mixed"];
    const requestedStyle = text(body?.learning_style, 20).toLowerCase();
    const learningStyle = STYLES.includes(requestedStyle) ? requestedStyle : "mixed";
    if (!topic) return json({ error: "A topic is required" }, 400);

    // Caller's org + role (RLS-scoped read).
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "No active organization" }, 403);
    const orgId = membership.org_id as string;

    // ---- Grounding: standing office rules (authoritative) -------------------
    const { data: memories } = await supabase
      .from("assistant_memories")
      .select("content, kind")
      .eq("org_id", orgId)
      .eq("kind", "office")
      .eq("status", "active")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(120);

    const memoryBlock = (memories ?? [])
      .map((m: { content: string }) => `- ${text(m.content, 700)}`)
      .join("\n");

    // ---- Grounding: office documents (same corpus ask-docs searches) --------
    const seen = new Map<string, string>();
    for (const term of searchTerms(topic, audience)) {
      const { data: matches } = await supabase.rpc("search_office_doc_chunks", {
        p_query: term,
        p_limit: 6,
      });
      for (const m of (matches ?? []) as {
        doc_id: string;
        title: string;
        chunk_index: number;
        content: string;
      }[]) {
        const key = `${m.doc_id}:${m.chunk_index}`;
        if (!seen.has(key)) seen.set(key, `[${m.title}] ${m.content}`);
      }
    }
    let docBlock = "";
    for (const chunk of seen.values()) {
      if (docBlock.length + chunk.length > MAX_DOC_CHARS) break;
      docBlock += `${chunk}\n\n`;
    }

    // ---- Grounding: how the doctor set the practice up ---------------------
    const [{ data: branding }, { data: fof }, { data: roster }] = await Promise.all([
      supabase.from("org_branding").select("*").eq("org_id", orgId).maybeSingle(),
      supabase.from("fof_settings").select("*").eq("org_id", orgId).maybeSingle(),
      supabase
        .from("employees")
        .select("display_name")
        .eq("org_id", orgId)
        .eq("employment_status", "active")
        .limit(40),
    ]);

    const settingsBlock = JSON.stringify(
      {
        practice: branding?.display_name ?? fof?.practice_name ?? null,
        doctor: fof?.doctor_name ?? fof?.doctor_names ?? null,
        membership_plan: fof?.membership_plan_name ?? null,
        day_of_service_threshold_cents: fof?.day_of_service_threshold_cents ?? null,
        min_standalone_payment_cents: fof?.min_standalone_payment_cents ?? null,
        team_size: (roster ?? []).length,
      },
      null,
      1
    ).slice(0, 3000);

    const styleGuide: Record<string, string> = {
      visual:
        "This person learns VISUALLY. Build the teaching around things they can see and draw: describe a simple diagram, a flow, a colour-coded checklist, or a layout they can sketch in 60 seconds. Every 'try_it' is a make-something task (sketch the flow, mark up the schedule, colour-code the tray). Quiz questions should describe what someone SEES (a screen, a schedule, a ledger, a chart note) and ask what it means or what to do next.",
      auditory:
        "This person learns by LISTENING and TALKING. Build the teaching around spoken scripts, phone and chairside dialogue, and phrases to say out loud. Every 'try_it' is a say-it-out-loud task (read the script aloud twice, rehearse the callback with a teammate). Quiz questions should quote what a patient SAYS and ask what you say back.",
      reading:
        "This person learns by READING and WRITING. Build the teaching around crisp written steps, short numbered checklists, and precise wording. Every 'try_it' is a write-it task (write the note, list the three steps, draft the message). Quiz questions should be precise, wording-focused, and definition- or policy-accurate.",
      kinesthetic:
        "This person learns HANDS-ON. Build the teaching around doing the thing: walk-throughs, practice reps, and physical or on-screen steps in order. Every 'try_it' is a do-it-now rep on their next shift. Quiz questions should put them mid-task and ask for the next physical or system action.",
      mixed:
        "Mix the modes: something to picture, something to say aloud, something to write, and something to do. Vary the 'try_it' tasks across those modes.",
    };

    const system = `You write short, excellent, practical training modules for a dental practice's team.

THE RULES OF THIS OFFICE ARE THE RULES OF THE WORLD.
- The STANDING OFFICE RULES below are authoritative. Never contradict them. Where they touch the topic, they ARE the content of the module.
- The OFFICE DOCUMENTS are how this practice actually operates: role expectations, procedures, and how the doctor wants each position to function. Prefer them over anything you know generally.
- Never give generic internet best-practice advice that conflicts with office policy. If your general knowledge disagrees with this office, the office wins, silently — do not point out the disagreement.
- If the sources do not cover something, teach the judgment and the escalation path ("check with the doctor / office manager") rather than inventing a policy.

WRITING RULES
- Concrete dental front-office situations, not abstractions. Real dialogue, real phrasing staff can reuse today.
- Fictional scenarios ONLY. Invent patient names and situations. Never reference real patients or real patient data.
- Warm, respectful, practical. Talk to a capable colleague, never down to them.
- 3 to 5 sections. Each section body is 120-260 words and ends naturally; the "try_it" is one specific action the person can do on their very next shift.
- The quiz has 4-6 scenario questions (a short situation, then what should you do). Each has 3-4 options, exactly one best answer, and a "why" that teaches the reasoning — not just "correct".

HOW THIS PERSON LEARNS
${styleGuide[learningStyle] ?? styleGuide.mixed}
Never mention the learning style itself — just teach and test that way.

Return ONLY JSON in exactly this shape:
{"title":"...","summary":"one sentence","outcome":"what the person can do after this module","sections":[{"heading":"...","body":"...","try_it":"..."}],"recap":"3-5 sentence recap","quiz":{"questions":[{"q":"...","options":["..."],"correct_index":0,"why":"..."}]}}`;

    const userPrompt = `TOPIC: ${topic}
AUDIENCE (positions this is for): ${audience.length ? audience.join(", ") : "all"}
LEARNING STYLE: ${learningStyle}

STANDING OFFICE RULES (authoritative):
${memoryBlock || "(none recorded yet)"}

OFFICE DOCUMENTS (excerpts):
${docBlock || "(no matching documents)"}

PRACTICE CONFIGURATION:
${settingsBlock}`;

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        reasoning_effort: "none",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (response.status === 429) {
      return json({ error: "The AI is busy right now — try again in a moment." }, 429);
    }
    if (response.status === 402) {
      return json({ error: "AI credits are exhausted. Add credits to keep building modules." }, 402);
    }
    if (!response.ok) {
      console.error("gateway error", response.status, await response.text());
      return json({ error: "The module builder could not finish. Try again." }, 502);
    }

    const data = await response.json();
    const raw = (data?.choices?.[0]?.message?.content as string | undefined) ?? "";
    const parsed = parseJsonBlock<Record<string, unknown>>(raw);
    const content = normalizeContent(parsed);
    if (!parsed || !content) {
      console.error("unparseable module output", raw.slice(0, 500));
      return json({ error: "The module builder returned something unusable. Try again." }, 502);
    }

    const title = text(parsed.title, 200) || topic;
    const summary = text(parsed.summary, 400);

    // ---- Auditor pass: a second, independent read before anyone is taught ----
    // Checks the draft against the same authoritative sources for anything that
    // contradicts office rules, is factually wrong, or is inappropriate.
    const auditSystem = `You are the training auditor for a dental practice. You review a DRAFT training module before the team sees it.

Check for, and only for:
1. CONTRADICTION — anything that conflicts with the STANDING OFFICE RULES, the OFFICE DOCUMENTS, or the PRACTICE CONFIGURATION.
2. INCORRECT — clinical, billing, insurance, or legal statements that are factually wrong or unsafe.
3. INAPPROPRIATE — disrespectful, discriminatory, shaming, or unprofessional content; anything resembling real patient data (PHI); medical or legal advice beyond the team's scope.
4. UNSUPPORTED — a policy stated as this office's policy that no source supports.

Be strict but not pedantic. Style, tone, and wording preferences are NOT findings.
Quote the offending text briefly and say exactly how to fix it.

Return ONLY JSON:
{"verdict":"clean|needs_review|blocked","summary":"one sentence","findings":[{"severity":"low|medium|high","kind":"contradiction|incorrect|inappropriate|unsupported","where":"section heading or 'quiz'","quote":"short quote","issue":"what is wrong","fix":"how to fix it"}]}
"blocked" only when something is unsafe, contradicts an explicit office rule, or is inappropriate.`;

    let audit: Record<string, unknown> = {
      verdict: "unreviewed",
      summary: "The auditor could not review this module.",
      findings: [],
      reviewed_at: new Date().toISOString(),
      model: MODEL,
    };

    try {
      const auditResponse = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          reasoning_effort: "none",
          messages: [
            { role: "system", content: auditSystem },
            {
              role: "user",
              content: `STANDING OFFICE RULES (authoritative):
${memoryBlock || "(none recorded yet)"}

OFFICE DOCUMENTS (excerpts):
${docBlock || "(no matching documents)"}

PRACTICE CONFIGURATION:
${settingsBlock}

DRAFT MODULE:
${JSON.stringify({ title, summary, ...content }).slice(0, 40000)}`,
            },
          ],
        }),
      });

      if (auditResponse.ok) {
        const auditData = await auditResponse.json();
        const auditRaw = (auditData?.choices?.[0]?.message?.content as string | undefined) ?? "";
        const auditParsed = parseJsonBlock<Record<string, unknown>>(auditRaw);
        if (auditParsed) {
          const verdict = text(auditParsed.verdict, 20);
          const findings = Array.isArray(auditParsed.findings)
            ? (auditParsed.findings as Record<string, unknown>[])
                .map((f) => ({
                  severity: text(f?.severity, 10) || "low",
                  kind: text(f?.kind, 20) || "unsupported",
                  where: text(f?.where, 160),
                  quote: text(f?.quote, 400),
                  issue: text(f?.issue, 600),
                  fix: text(f?.fix, 600),
                }))
                .filter((f) => f.issue)
                .slice(0, 20)
            : [];
          audit = {
            verdict: ["clean", "needs_review", "blocked"].includes(verdict)
              ? verdict
              : findings.length
              ? "needs_review"
              : "clean",
            summary: text(auditParsed.summary, 400),
            findings,
            reviewed_at: new Date().toISOString(),
            model: MODEL,
          };
        }
      } else {
        console.error("auditor gateway error", auditResponse.status);
      }
    } catch (auditError) {
      console.error("auditor pass failed", auditError);
    }

    // A blocked module is saved as a draft so a manager reviews it first.
    const moduleStatus = audit.verdict === "blocked" ? "archived" : "published";

    const { data: saved, error: insertError } = await supabase
      .from("training_modules")
      .insert({
        org_id: orgId,
        title,
        summary,
        audience_tags: audience.length ? audience : ["all"],
        learning_style: learningStyle,
        content,
        audit,
        source: "pathfinder",
        origin_goal_id: originGoalId,
        status: moduleStatus,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("insert failed", insertError.message);
      return json({ error: "The module was written but could not be saved." }, 500);
    }

    return json({ module: saved, audit });
  } catch (error) {
    console.error("training-builder failed:", error);
    return json({ error: "Something went wrong building the module." }, 500);
  }
});
