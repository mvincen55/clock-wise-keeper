// Extract procedure rows from an uploaded practice-management screenshot
// (treatment plan / case detail view) so the FOF builder can auto-fill.
//
// HIPAA note: staff are instructed to crop out patient identifiers before
// uploading; the image is processed in memory only and never stored. The
// response contains ONLY procedure rows (code, tooth, description, fee,
// entry date). Insurance-estimate and patient-portion columns are
// deliberately ignored — estimates always come from the office's own
// fee schedules.

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

import { requireUser } from "../_shared/require-user.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Reads an uploaded clinical screenshot — signed-in members only, never open.
  const user = await requireUser(req);
  if (!user) return json({ error: "Not authorized" }, 401);

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "AI is not configured" }, 500);

    const { image } = (await req.json()) as { image: string };
    if (typeof image !== "string" || !image.startsWith("data:image/") || image.length > 8_000_000) {
      return json({ error: "Bad request" }, 400);
    }

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You extract procedure rows from a dental practice-management screenshot (treatment plan, case view, or ledger). Return ONLY a JSON array of rows: " +
              '[{"code": string, "tooth": string, "description": string, "fee": number|null, "officeFee": number|null, "entryDate": string, "visit": number|null}] — ' +
              "code = the procedure code exactly as shown (e.g. D2740, 2014); " +
              "tooth = the Th (tooth) column value copied EXACTLY as shown (e.g. 3, 22, 19*30) — check this cell carefully on EVERY row: crowns, fillings, extractions, splints, and buildups almost always have a tooth number, so only return an empty string when that cell is truly blank; " +
              "description = the description column text; " +
              "fee = the dollar amount from the Fee column as a plain number (null when blank or 0.00); " +
              "officeFee = the dollar amount from the OFFICE column as a plain number (null when there is no OFFICE column or it is blank/0.00) — Fee and OFFICE are DIFFERENT columns, read each from its own column; " +
              "entryDate = the Entry Date column value as shown (M/D/YYYY) or empty string; " +
              'visit = the number from the "Visit N" section header this row appears under, as a number, or null when there is no visit grouping. ' +
              "STRICTLY IGNORE insurance estimate columns (Prim Ins, Ins Pays) and patient portion columns (Pat. Portion) — never include them. " +
              "Skip header rows, totals rows, and rows with no code. Preserve row order. Reply with ONLY the JSON array.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the procedure rows from this screenshot." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        max_tokens: 4000,
      }),
    });
    if (!response.ok) return json({ error: "AI request failed" }, 502);
    const data = await response.json();
    const raw: string = data?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\[[\s\S]*\]/);
    let parsed: unknown = null;
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
    if (!Array.isArray(parsed)) {
      // Truncated output: salvage the complete row objects that did fit.
      parsed = (raw.match(/\{[^{}]*\}/g) ?? [])
        .map((o) => {
          try {
            return JSON.parse(o) as unknown;
          } catch {
            return null;
          }
        })
        .filter((o) => o !== null);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return json({ error: "No rows found in the screenshot" }, 502);
    }
    const rows = parsed
      .filter(
        (r): r is Record<string, unknown> =>
          !!r && typeof r === "object" && typeof (r as Record<string, unknown>).code === "string"
      )
      .slice(0, 40)
      .map((r) => ({
        code: String(r.code).trim(),
        tooth: typeof r.tooth === "string" ? r.tooth.trim() : "",
        description: typeof r.description === "string" ? r.description.trim() : "",
        fee: typeof r.fee === "number" && isFinite(r.fee) && r.fee > 0 ? r.fee : null,
        officeFee:
          typeof r.officeFee === "number" && isFinite(r.officeFee) && r.officeFee > 0
            ? r.officeFee
            : null,
        entryDate: typeof r.entryDate === "string" ? r.entryDate.trim() : "",
        visit: typeof r.visit === "number" && isFinite(r.visit) && r.visit > 0 ? r.visit : null,
      }))
      .filter((r) => r.code !== "");
    if (rows.length === 0) return json({ error: "No rows found in the screenshot" }, 502);
    return json({ rows });
  } catch (_err) {
    return json({ error: "Unexpected error" }, 500);
  }
});
