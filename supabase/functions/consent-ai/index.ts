// consent-ai — template tooling for Forms & Consents.
//
// Three jobs, all operating on the office's OWN template wording:
//   convert — turn extracted text of an uploaded blank form into structured
//             template blocks for the side-by-side review screen.
//   assist  — free-text drafting help for managers (simplify, rewrite,
//             missing risks, compare versions, draft a section). Suggestions
//             only; the client never applies an AI edit without explicit
//             review and approval.
//   review  — structured suggestions: each item quotes a short passage
//             verbatim and proposes a replacement with a reason, so the
//             client can show original-vs-suggested cards and apply a
//             single accepted change precisely.
//
// PHI boundary: staff are instructed to upload blank master forms, and the
// client requires that confirmation before calling here. Belt and braces:
// every outbound message still passes through scrubMessages, so a filled
// form uploaded by mistake has person-level spans redacted at the wire.
// Nothing from the Complete Forms workflow (patient names, teeth, fees
// typed for a patient) is ever sent to this function.

import { requireUser } from "../_shared/require-user.ts";
import { scrubMessages } from "../_shared/ai-safe.ts";

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
const MODEL = "google/gemini-2.5-flash";
const SURFACE = "consent-ai";

const BLOCK_SCHEMA = `Each block is one of:
{"type":"title","label":string}
{"type":"section","label":string,"kind":"description"|"purpose"|"benefits"|"risks"|"serious_risks"|"alternatives"|"declining"|"questions"|"consent_statement"|"preop"|"postop"|"other","body"?:string}
{"type":"instruction","body":string}
{"type":"paragraph","body":string}
{"type":"bullets","items":string[]}
{"type":"checkbox","label":string}
{"type":"yesno","label":string,"required"?:boolean}
{"type":"short_answer","label":string}
{"type":"long_answer","label":string}
{"type":"date","label":string,"required"?:boolean}
{"type":"tooth_numbers","label":string}
{"type":"procedure","label":string}
{"type":"provider","label":string}
{"type":"patient_name","label":string,"required"?:boolean}
{"type":"cost","label":string}
{"type":"initials","label":string}
{"type":"signature","role":"patient"|"guardian"|"doctor"|"hygienist"|"assistant"|"witness"}
{"type":"medications","label":string,"items":string[]}
{"type":"divider"}
{"type":"page_break"}`;

const CONVERT_SYSTEM =
  "You convert a dental office's consent/instruction form (extracted text of a BLANK master form) into structured template blocks. " +
  "Reproduce the office's wording faithfully — do not rewrite, summarize, or invent clinical content. Keep the original title wording. " +
  "Recognize headings, paragraphs, bullet lists, initial lines, signature lines (and whose signature), date fields, patient-name fields, " +
  "tooth-number fields, procedure fields, cost/fee fields, yes/no questions, checkboxes, and medication selections. " +
  "Classify section headings with the closest \"kind\". Underscore runs (____) mark fill-in fields — emit the matching field block instead of the underscores. " +
  "The app prints every template inside a master layout that already provides the office letterhead, the form name in the page header, " +
  "a patient row (Patient Name and Date of Birth) at the top of page one, and a date column beside every signature line. " +
  "Do NOT emit blocks for those: skip letterhead/practice-name text, skip patient-name and date-of-birth fill-in fields, " +
  "and never add a separate date field next to a signature line. " +
  `${BLOCK_SCHEMA}\n` +
  'Reply with ONLY JSON: {"category": "general_consent"|"surgical_consent"|"restorative"|"endodontic"|"periodontal"|"implant"|"orthodontic"|"sedation"|"medication"|"financial"|"preoperative"|"postoperative"|"office_policy"|"other", "blocks": [ ... ]}';

const ASSIST_SYSTEMS: Record<string, string> = {
  rewrite:
    "Rewrite the dental consent text for patient understanding at roughly an 8th-grade reading level. Keep every clinical fact, risk, and legal meaning intact. Reply with only the rewritten text.",
  simplify:
    "Simplify the dental consent text: shorter sentences, plain words, same meaning. Do not remove any risk, alternative, or consent language. Reply with only the simplified text.",
  professional:
    "Rewrite the dental consent text in a professional, calm, patient-respectful tone suitable for a printed office form. Keep all content. Reply with only the rewritten text.",
  missing_risks:
    "You review a dental consent form. List risks, complications, or disclosures commonly included in similar consents that appear to be MISSING from this text. Be specific and conservative — do not invent exotic risks. Reply as a short bullet list, or 'None noted.' if it is thorough.",
  unclear:
    "You review a dental consent form for wording a patient could misread: ambiguity, jargon without explanation, run-on sentences, or contradictions. Quote each unclear passage briefly and say why. Reply as a short bullet list, or 'None noted.'",
  suggest_sections:
    "You review the structure of a dental consent form. Suggest sections commonly found in similar consent forms that this one lacks (e.g. alternatives, consequences of declining, questions acknowledgment). Reply as a short bullet list, or 'None noted.'",
  compare:
    "Compare VERSION A and VERSION B of a dental consent form. Summarize what changed: added content, removed content, meaning changes, and tone changes. Flag any removed risk or consent language prominently. Reply as short bullets grouped under 'Added', 'Removed', and 'Changed'.",
  // Goal modes for the review-based builder panel.
  warmer:
    "Rewrite the dental consent text in a warmer, friendlier voice that is easier for patients to read: reassuring, plain words, shorter sentences. Keep every clinical fact, risk, and legal meaning intact. Reply with only the rewritten text.",
  shorten:
    "Tighten the dental consent text: remove repetition and filler while keeping every clinical fact, risk, alternative, and consent statement. Do not drop meaning to save words. Reply with only the shortened text.",
  grammar:
    "Fix grammar, punctuation, and organization in the dental consent text. Reorder only where it clearly improves flow; never change clinical or legal meaning. Reply with only the corrected text.",
  draft_section:
    "Draft one new section for a dental consent form from the manager's short description. Professional, calm, patient-respectful, roughly 8th-grade reading level. Do not invent office-specific policies, fees, or clinical claims beyond the description. Reply with only the drafted section text — no heading markup, no commentary.",
};

// ---------------------------------------------------------------------------
// Structured review — original / suggested / reason triples
// ---------------------------------------------------------------------------

const REVIEW_GOALS: Record<string, string> = {
  simplify:
    "Focus on wording a patient could find hard: long sentences, jargon, dense phrasing. Each suggestion simplifies the quoted passage while keeping every clinical fact, risk, and legal meaning.",
  warmer:
    "Focus on passages that read cold, clinical, or intimidating. Each suggestion keeps the same meaning in a warmer, patient-respectful voice.",
  missing_info:
    "Focus on consent information commonly included in similar dental consent forms that is missing or incomplete here (risks, alternatives, consequences of declining, questions acknowledgment, consent statement). Quote the passage the addition belongs with and propose replacement wording that includes it. Be conservative — do not invent exotic risks.",
  shorten:
    "Focus on passages that can be tightened without losing any clinical fact, risk, or consent language. Each suggestion is a shorter rewrite of the quoted passage.",
  grammar:
    "Focus on grammar, punctuation, and organization problems. Each suggestion corrects the quoted passage without changing its meaning.",
};

const reviewSystem = (focus: string): string =>
  "You review a dental office's consent/instruction form template — the office's own wording, never patient data. " +
  `${focus} ` +
  'Reply with ONLY JSON: {"items":[{"original":string,"suggested":string,"reason":string}]}. ' +
  'Each "original" quotes a short passage (under 300 characters) VERBATIM from the template so it can be located and replaced. ' +
  '"suggested" is the complete replacement for that passage. "reason" is one short sentence. ' +
  'At most 8 items, most important first. If nothing needs changing, reply {"items":[]}.';

interface ReviewItem {
  original: string;
  suggested: string;
  reason: string;
}

/** Null means the model's reply was not usable JSON — the caller 502s. */
function parseReviewItems(raw: string): ReviewItem[] | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return null;
  const clean: ReviewItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const { original, suggested, reason } = item as Record<string, unknown>;
    // A suggestion without a verbatim quote cannot be applied — drop it.
    if (typeof original !== "string" || !original.trim()) continue;
    if (typeof suggested !== "string") continue;
    clean.push({
      original: original.slice(0, 2000),
      suggested: suggested.slice(0, 4000),
      reason: typeof reason === "string" ? reason.slice(0, 300) : "",
    });
  }
  return clean;
}

async function callGateway(apiKey: string, system: string, userText: string, maxTokens: number): Promise<string> {
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: scrubMessages(
        [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
        SURFACE,
      ),
      max_tokens: maxTokens,
    }),
  });
  if (!response.ok) throw new Error(`gateway ${response.status}`);
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Not authorized" }, 401);

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const body = (await req.json()) as {
      action?: string;
      name?: string;
      text?: string;
      mode?: string;
      otherText?: string;
      goal?: string;
      scope_label?: string;
    };

    if (body.action === "convert") {
      const text = typeof body.text === "string" ? body.text.slice(0, 40_000) : "";
      const name = typeof body.name === "string" ? body.name.slice(0, 200) : "";
      if (!text.trim()) return json({ error: "Nothing to convert" }, 400);

      const raw = await callGateway(
        apiKey,
        CONVERT_SYSTEM,
        `Form name: ${name || "(untitled)"}\n\nExtracted form text:\n${text}`,
        8000,
      );
      const match = raw.match(/\{[\s\S]*\}/);
      let parsed: unknown = null;
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch {
          parsed = null;
        }
      }
      if (!parsed || typeof parsed !== "object") {
        return json({ error: "Conversion produced no usable structure" }, 422);
      }
      // The client re-validates every block (sanitizeBlocks) before showing
      // the review screen; nothing here is trusted or auto-published.
      return json({ result: parsed });
    }

    if (body.action === "assist") {
      const mode = typeof body.mode === "string" ? body.mode : "";
      const system = ASSIST_SYSTEMS[mode];
      if (!system) return json({ error: "Unknown assist mode" }, 400);
      const text = typeof body.text === "string" ? body.text.slice(0, 24_000) : "";
      if (!text.trim()) return json({ error: "Nothing to review" }, 400);

      const userText =
        mode === "compare"
          ? `VERSION A:\n${text}\n\nVERSION B:\n${typeof body.otherText === "string" ? body.otherText.slice(0, 24_000) : ""}`
          : text;

      const result = await callGateway(apiKey, system, userText, 4000);
      if (!result.trim()) return json({ error: "No suggestion produced" }, 422);
      return json({ result: result.trim() });
    }

    if (body.action === "review") {
      const goal = typeof body.goal === "string" ? body.goal : "";
      const focus = REVIEW_GOALS[goal];
      if (!focus) return json({ error: "Unknown review goal" }, 400);
      const text = typeof body.text === "string" ? body.text.slice(0, 24_000) : "";
      if (!text.trim()) return json({ error: "Nothing to review" }, 400);
      const scopeLabel = typeof body.scope_label === "string" ? body.scope_label.slice(0, 60) : "";

      const raw = await callGateway(
        apiKey,
        reviewSystem(focus),
        `Scope: ${scopeLabel || "Entire form"}\n\nTemplate text:\n${text}`,
        6000,
      );
      const items = parseReviewItems(raw);
      if (items === null) {
        return json({ error: "The AI review came back in a format the app could not read. Try again." }, 502);
      }
      return json({ items });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("consent-ai error", err instanceof Error ? err.message : err);
    return json({ error: "AI request failed" }, 502);
  }
});
