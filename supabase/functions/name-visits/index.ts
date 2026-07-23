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

    const { slots, visits } = (await req.json()) as {
      /** Current payment slot labels, in order (e.g. "Upon Scheduling", "Crown Prep"). */
      slots: string[];
      /** Procedures happening at each clinical visit, in order. */
      visits: { procedures: string[] }[];
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
              "You name the payments on a dental Financial Options Form so a patient instantly understands when each payment happens. You are given the clinical visits (with their procedures) and the current payment slot labels in order. Rewrite each slot label to be short (2-4 words), natural, and specific: e.g. 'Work Up Visit', 'Upon Scheduling Surgery', 'Implant Surgery', 'Crown Prep Visit'. STRICT RULES: each slot corresponds to an existing visit (or a scheduling payment) — name it ONLY from the procedures actually listed for that visit; NEVER invent visits, stages, or events that are not in the visit list (no 'Delivery', 'Installation', or 'Seat' names unless a listed visit's procedures are that work). Keep 'Upon Scheduling' slots recognizable as scheduling payments (you may add what is being scheduled). Never use 'Visit 1/2/3' numbering, codes, or prices. Reply with ONLY a JSON array of strings, exactly one per slot, same order.",
          },
          {
            role: "user",
            content: `Clinical visits:\n${visitLines}\n\nCurrent slot labels (rename each): ${JSON.stringify(slots)}`,
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
