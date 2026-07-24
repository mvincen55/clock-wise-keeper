// AI pass over the FOF payment-plan names: given the visit structure
// (which procedures happen at which visit) and the current auto-generated
// slot labels, return friendlier appointment-style names for staff to
// tweak.
//
// HIPAA note: the payload must be DE-IDENTIFIED BY CONSTRUCTION —
// procedure names, validated tooth numbers, visit order, and the
// practice's doctor name only. The client builds it exclusively from CDT
// friendly names / codes (see buildNameVisitsPayload in
// src/lib/fof/ai.ts); this function additionally authenticates the
// caller, requires an active org membership, and hard-caps every string
// so it can never be used as an open relay to the (non-BAA) AI gateway.

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
const MODEL = "google/gemini-2.5-flash";

const MAX_SLOTS = 12;
const MAX_VISITS = 12;
const MAX_PROCEDURES_PER_VISIT = 12;
const MAX_LABEL_LENGTH = 80;

/** Coerce to a bounded single-line string; empty result = dropped. */
const boundedLabel = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH) : "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    // The platform gateway verifies the JWT (verify_jwt=true), but the
    // caller is re-checked here so the function stays closed even if the
    // config ever regresses — same posture as ask-docs/ingest-doc.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    // Only active org members may spend AI credits.
    const { data: membership } = await supabase
      .from("org_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "Unauthorized" }, 403);

    const { slots, visits, wantTreatment, doctorName } = (await req.json()) as {
      /** Current payment slot labels, in order (e.g. "Upon Scheduling", "Crown Prep"). */
      slots: string[];
      /** Procedures happening at each clinical visit, in order (may include "(tooth #N)"). */
      visits: { procedures: string[] }[];
      /** Also write a plain-language treatment summary for the form. */
      wantTreatment?: boolean;
      /** Treating doctor's display name (practice config, not patient data). */
      doctorName?: string;
    };
    if (!Array.isArray(slots) || slots.length === 0 || slots.length > MAX_SLOTS) {
      return json({ error: "Bad request" }, 400);
    }
    const boundedSlots = slots.map(boundedLabel);
    if (boundedSlots.some((s) => s === "")) return json({ error: "Bad request" }, 400);
    if (Array.isArray(visits) && visits.length > MAX_VISITS) {
      return json({ error: "Bad request" }, 400);
    }
    const doctor =
      typeof doctorName === "string" && doctorName.trim().length > 0 && doctorName.length <= 40
        ? doctorName.replace(/\s+/g, " ").trim()
        : "The doctor";
    const visitLines = (Array.isArray(visits) ? visits : [])
      .map((v, i) => {
        const procedures = (Array.isArray(v?.procedures) ? v.procedures : [])
          .slice(0, MAX_PROCEDURES_PER_VISIT)
          .map(boundedLabel)
          .filter(Boolean);
        return `Visit ${i + 1}: ${procedures.join(", ") || "—"}`;
      })
      .join("\n");

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are the treatment coordinator at a dental office — a warm, confident closer who makes patients feel great about saying yes to the care they need. You word the Financial Options Form. You get the clinical visits (with their procedures, some annotated with tooth numbers) and the current payment slot labels in order. " +
              'Reply with ONLY a JSON object: {"names": string[], "treatment": string}. ' +
              "names: rewrite each slot label, short (2-5 words), specific and timing-first so the patient knows WHEN it's due and what it's for. Name each visit after its most significant procedure that day: 'At the Extraction Visit', 'At Crown Prep', 'At Implant Surgery', 'On Partial Delivery' — never a vague label like 'Diagnostic Visit' or 'Treatment Visit' when real work happens that day. A surgical guide is never 'delivered' — it's simply used on implant surgery day, so name a records/guide visit for what the patient experiences ('At the Records Visit'), never 'Guide Delivery'. Scheduling payments keep 'Upon Scheduling' (optionally + what's being scheduled). A payment may prepay later work — never name it after work that happens at a different visit, and NEVER invent visits or stages not in the list. No 'Visit 1/2/3' numbering, codes, or prices. Exactly one name per slot, same order. " +
              `treatment: 2-3 clean sentences summarizing the whole plan, written in third person using the doctor's name (the doctor is ${JSON.stringify(doctor)}). RULES: ` +
              "(1) Describe the actual procedures in plain concrete verbs — 'splint the loose teeth', 'remove tooth #24', 'place porcelain crowns on teeth #22 and #27'. NEVER vague clinical filler like 'stabilize initial symptoms', 'address concerns', or 'comprehensive treatment'. " +
              "(2) Every tooth number provided in the visit list MUST appear next to its procedure. EXCEPTION: dentures and partials get arch wording only ('a new lower partial denture') — never tooth numbers or ranges for a denture, even if teeth are listed. " +
              "(3) Never promise or guarantee results. Frame outcomes as the goal: 'designed to restore comfortable chewing', 'to help rebuild a strong, functional bite'. BANNED: 'full function', 'complete', 'perfect', 'permanent', 'guaranteed', 'will restore', 'pain-free', and any absolute promise. " +
              "(4) End on the goal of the plan (comfort, function, or the finished smile) — as an aim, not a promise. " +
              "No codes, no prices, no per-visit breakdown, no hype words; 420 characters max.",
          },
          {
            role: "user",
            content: `Clinical visits:\n${visitLines}\n\nCurrent slot labels (rename each): ${JSON.stringify(boundedSlots)}\n\nInclude treatment summary: ${wantTreatment ? "yes" : "no"}`,
          },
        ],
        max_tokens: 500,
      }),
    });
    if (!response.ok) return json({ error: "AI request failed" }, 502);
    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: "AI returned no names" }, 502);
    const parsed = JSON.parse(match[0]) as { names?: unknown; treatment?: unknown };
    const names = parsed.names;
    if (
      !Array.isArray(names) ||
      names.length !== slots.length ||
      !names.every((n) => typeof n === "string" && n.trim().length > 0 && n.length <= 60)
    ) {
      return json({ error: "AI returned unusable names" }, 502);
    }
    const treatment =
      typeof parsed.treatment === "string" && parsed.treatment.trim().length > 0
        ? parsed.treatment.trim().slice(0, 450)
        : null;
    return json({ names: names.map((n) => (n as string).trim()), treatment });
  } catch (_err) {
    return json({ error: "Unexpected error" }, 500);
  }
});
