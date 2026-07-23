// AI pass over the FOF payment-plan names: given the visit structure
// (which procedures happen at which visit) and the current auto-generated
// slot labels, return friendlier appointment-style names for staff to
// tweak.
//
// HIPAA note: the payload is DE-IDENTIFIED BY CONSTRUCTION — procedure
// names and visit order only. No patient name, no date, no dollar
// amounts, no identifiers of any kind may be added to this request.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const { slots, visits, wantTreatment } = (await req.json()) as {
      /** Current payment slot labels, in order (e.g. "Upon Scheduling", "Crown Prep"). */
      slots: string[];
      /** Procedures happening at each clinical visit, in order. */
      visits: { procedures: string[] }[];
      /** Also write a plain-language treatment summary for the form. */
      wantTreatment?: boolean;
    };
    if (!Array.isArray(slots) || slots.length === 0 || slots.length > 12) {
      return json({ error: "Bad request" }, 400);
    }
    const visitLines = (visits ?? [])
      .map((v, i) => `Visit ${i + 1}: ${(v.procedures ?? []).slice(0, 12).join(", ") || "—"}`)
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
              "You word a dental Financial Options Form so a patient instantly understands it. You get the clinical visits (with their procedures) and the current payment slot labels in order. " +
              'Reply with ONLY a JSON object: {"names": string[], "treatment": string}. ' +
              "names: rewrite each slot label, short (2-5 words), natural, timing-first so the patient knows WHEN it's due: visit payments read like 'At the Work Up Visit', 'At Crown Prep', 'On Denture Delivery'; scheduling payments keep 'Upon Scheduling' (optionally + what's being scheduled). A payment may prepay later work — never name it after work that happens at a different visit, and NEVER invent visits or stages not in the list. No 'Visit 1/2/3' numbering, codes, or prices. Exactly one name per slot, same order. " +
              "treatment: 1-2 warm, plain sentences summarizing the whole plan the way a person would say it to a patient (e.g. 'We'll steady the loose teeth with splinting, remove the tooth that can't be saved, place two porcelain crowns, and finish with a lower partial denture.'). No codes, no prices, no per-visit breakdown; mention arch wording like 'lower partial denture' instead of tooth numbers; 320 characters max.",
          },
          {
            role: "user",
            content: `Clinical visits:\n${visitLines}\n\nCurrent slot labels (rename each): ${JSON.stringify(slots)}\n\nInclude treatment summary: ${wantTreatment ? "yes" : "no"}`,
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
        ? parsed.treatment.trim().slice(0, 400)
        : null;
    return json({ names: names.map((n) => (n as string).trim()), treatment });
  } catch (_err) {
    return json({ error: "Unexpected error" }, 500);
  }
});
