/**
 * Commitment listening — the AI channel notices when someone says they'll do
 * something ("I'll call the lab tomorrow") and offers to hold it for them.
 *
 * It only ever *offers*. Nothing lands on anyone's list without a tap, and a
 * declined idea is never raised again (the client stores a fingerprint).
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { requireUser } from "../_shared/require-user.ts";
import { logScrub, scrubFreeText } from "../_shared/phi-scrub.ts";

const MODEL = "google/gemini-3.6-flash";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // This spends AI credits, so it belongs to signed-in members only.
  const user = await requireUser(req);
  if (!user) return json({ error: "Not authorized" }, 401);

  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ capture: null });

    const body = await req.json().catch(() => ({}));
    const scrubbed = scrubFreeText(typeof body?.message === "string" ? body.message : "", 2000);
    logScrub("commitment-listen.message", scrubbed);
    const message = scrubbed.text;
    const today = typeof body?.today === "string" ? body.today : new Date().toISOString().slice(0, 10);
    if (!message.trim()) return json({ capture: null });

    const system = `${OFFICE_DOCTRINE}

---

TASK: read ONE message a team member just wrote in the AI channel and decide whether they stated or implied they will do something.

Return strict JSON only, no prose:
{"commitment": true|false, "title": "short action in their own words, max 8 words", "first_step": "the tiniest possible opening move, one sentence", "due_date": "YYYY-MM-DD"}

Rules:
- commitment=false unless there is a real, concrete action THEY will take ("I'll call the lab", "remind me to run the report"). Questions, opinions, and general chat are not commitments.
- Today is ${today}. Resolve "tomorrow", weekday names, and "next week" into a real date. No date mentioned = today.
- Title is the action, not a sentence about the action. No patient names or clinical details, ever.
- first_step must be genuinely tiny — something doable in about two minutes.
- When unsure, return commitment=false. Quiet is better than noise.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
        response_format: { type: "json_object" },
      }),
    });

    // Fails open everywhere: capture is a bonus, never a blocker.
    if (!response.ok) {
      console.error("commitment-listen gateway error", response.status, await response.text());
      return json({ capture: null });
    }

    const completion = await response.json();
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ capture: null });
    }

    if (parsed.commitment !== true || typeof parsed.title !== "string" || !parsed.title.trim()) {
      return json({ capture: null });
    }

    const dueDate = typeof parsed.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.due_date)
      ? parsed.due_date
      : today;

    return json({
      capture: {
        title: String(parsed.title).trim().slice(0, 120),
        first_step: typeof parsed.first_step === "string" ? parsed.first_step.slice(0, 200) : null,
        due_date: dueDate,
      },
    });
  } catch (error) {
    console.error("commitment-listen error:", error);
    return json({ capture: null });
  }
});
