// AI pass over the FOF payment-plan names: given the visit structure
// (which procedures happen at which visit) and the current auto-generated
// slot labels, return friendlier appointment-style names for staff to
// tweak.
//
// HIPAA note: the payload must be DE-IDENTIFIED BY CONSTRUCTION —
// procedure names and visit order only. The client builds it exclusively
// from CDT friendly names / codes (see buildNameVisitsPayload in
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

    const { slots, visits } = (await req.json()) as {
      /** Current payment slot labels, in order (e.g. "Upon Scheduling", "Crown Prep"). */
      slots: string[];
      /** Procedures happening at each clinical visit, in order. */
      visits: { procedures: string[] }[];
    };
    if (!Array.isArray(slots) || slots.length === 0 || slots.length > MAX_SLOTS) {
      return json({ error: "Bad request" }, 400);
    }
    const boundedSlots = slots.map(boundedLabel);
    if (boundedSlots.some((s) => s === "")) return json({ error: "Bad request" }, 400);
    if (Array.isArray(visits) && visits.length > MAX_VISITS) {
      return json({ error: "Bad request" }, 400);
    }
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
              "You name the payments on a dental Financial Options Form so a patient instantly understands when each payment happens. You are given the clinical visits (with their procedures) and the current payment slot labels in order. Rewrite each slot label to be short (2-4 words), natural, and specific to the treatment: e.g. 'Work Up Visit', 'Upon Scheduling Surgery', 'Implant Surgery', 'Crown Impressions', 'Denture Delivery'. Keep 'Upon Scheduling' slots recognizable as scheduling payments (you may add what is being scheduled). Never use 'Visit 1/2/3' numbering, codes, or prices. Reply with ONLY a JSON array of strings, exactly one per slot, same order.",
          },
          {
            role: "user",
            content: `Clinical visits:\n${visitLines}\n\nCurrent slot labels (rename each): ${JSON.stringify(boundedSlots)}`,
          },
        ],
        max_tokens: 300,
      }),
    });
    if (!response.ok) return json({ error: "AI request failed" }, 502);
    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return json({ error: "AI returned no names" }, 502);
    const names = JSON.parse(match[0]) as unknown;
    if (
      !Array.isArray(names) ||
      names.length !== slots.length ||
      !names.every((n) => typeof n === "string" && n.trim().length > 0 && n.length <= 60)
    ) {
      return json({ error: "AI returned unusable names" }, 502);
    }
    return json({ names: names.map((n) => (n as string).trim()) });
  } catch (_err) {
    return json({ error: "Unexpected error" }, 500);
  }
});
