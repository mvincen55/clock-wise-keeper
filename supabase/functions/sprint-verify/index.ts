// sprint-verify — closes out a team sprint with a recorded decision.
//
// Four actions, all owner/manager only:
//   approve  — one-tap electronic approval (recorded decision, not a signature)
//   decline  — one-tap decline with an optional note
//   document — the AI reads an uploaded outside report and renders a verdict WITH RECEIPTS
//   override — a human overrules the AI's document verdict, reason required
//
// Humans outrank the document reader. Every decision stores who and when.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { logScrub, scrubFreeText } from "../_shared/phi-scrub.ts";


const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Document reading is the one place we spend on the strongest model available.
const STRONG_MODEL = "google/gemini-3.1-pro-preview";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Verdict = {
  supported: boolean;
  found_count: number | null;
  where: string;
  reasoning: string;
};

function base64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function readDocument(
  apiKey: string,
  fileB64: string,
  mime: string,
  filename: string,
  sprint: Record<string, unknown>,
): Promise<Verdict> {
  const block = mime === "application/pdf"
    ? { type: "file", file: { filename, file_data: `data:${mime};base64,${fileB64}` } }
    : { type: "image_url", image_url: { url: `data:${mime};base64,${fileB64}` } };

  const instruction =
    `This office ran a sprint: "${sprint.title}". What was being counted: ${sprint.metric}. ` +
    `The target was ${sprint.target_count}. The attached document is the outside report the office uses as the source of truth.\n\n` +
    `HARD RULE: this office is bound by HIPAA and you are outside its BAA. Extract ONLY the single total for this metric. ` +
    `Never read back, quote, summarise, or reference any person-level row — no patient names, dates of birth, chart numbers, phone numbers or addresses — even if the document contains them. ` +
    `If the only way to answer would be to count or cite individual people, refuse: set supported to false, found_count to null, and say the export is person-level and a totals-only export is needed.\n\n` +
    `Read the document and answer with JSON only, no prose around it:\n` +
    `{"supported": true|false, "found_count": <the number you actually found, or null>, "where": "<where in the document you found it — section, row label, page. Never a person's name>", "reasoning": "<one or two plain sentences, no person-level detail>"}\n\n` +
    `supported = true only if the document itself shows a number for this metric that meets or beats ${sprint.target_count}. ` +
    `If the document does not clearly show this metric, set supported to false, found_count to null, and say so plainly in reasoning. Never estimate, never infer a number that is not printed.`;


  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: STRONG_MODEL,
      messages: [
        {
          role: "system",
          content:
            `${OFFICE_DOCTRINE}\n\n---\n\nYou are reading an office's own report to verify a team sprint result. ` +
            `Receipts are the whole job: state the number you found and exactly where you found it. Reply with JSON only.`,
        },
        { role: "user", content: [{ type: "text", text: instruction }, block] },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(res.status === 429
      ? "The AI is rate limited right now — try again in a minute."
      : res.status === 402
      ? "AI credits are exhausted. Add credits to keep document verification running."
      : `The document reader could not run (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = String(data?.choices?.[0]?.message?.content ?? "");
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The document reader returned nothing usable. You can still approve or decline by hand.");
  const parsed = JSON.parse(match[0]);
  // Nothing the model read is trusted back into the database unscrubbed.
  const where = scrubFreeText(String(parsed.where ?? ""), 400);
  const reasoning = scrubFreeText(String(parsed.reasoning ?? ""), 800);
  logScrub("sprint-verify.verdict", where);
  logScrub("sprint-verify.verdict", reasoning);
  return {
    supported: !!parsed.supported,
    found_count: typeof parsed.found_count === "number" ? parsed.found_count : null,
    where: where.text,
    reasoning: reasoning.text,
  };

}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const goalId = typeof body.goal_id === "string" ? body.goal_id : "";
    const action = String(body.action ?? "");
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const docPath = typeof body.doc_path === "string" ? body.doc_path : "";

    // Who is asking comes before what they asked. An unauthenticated caller
    // should learn nothing about this endpoint's expected shape.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sign in to verify a sprint." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: auth } = await asUser.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "Sign in to verify a sprint." }, 401);

    if (!goalId || !["approve", "decline", "document", "override"].includes(action)) {
      return json({ error: "Tell me which sprint and what decision." }, 400);
    }

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: sprint } = await db.from("team_goals").select("*").eq("id", goalId).maybeSingle();
    if (!sprint) return json({ error: "That sprint no longer exists." }, 404);

    const { data: member } = await db
      .from("org_members")
      .select("role")
      .eq("org_id", sprint.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member || !["owner", "manager"].includes(String(member.role))) {
      return json({ error: "Only a manager or the owner can verify a sprint." }, 403);
    }

    const stamp = { verified_by: user.id, verified_at: new Date().toISOString() };

    if (action === "approve" || action === "decline") {
      const { data: updated, error } = await db
        .from("team_goals")
        .update({
          ...stamp,
          status: action === "approve" ? "won" : "missed",
          verification_note: note || null,
        })
        .eq("id", goalId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, sprint: updated });
    }

    if (action === "override") {
      if (!note) return json({ error: "An override needs a reason — it goes on the record." }, 400);
      const toWon = body.result === "won";
      const { data: updated, error } = await db
        .from("team_goals")
        .update({ ...stamp, status: toWon ? "won" : "missed", override_reason: note })
        .eq("id", goalId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ ok: true, sprint: updated, overridden: true });
    }

    // action === "document"
    if (!docPath) return json({ error: "Upload the report first." }, 400);
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "Document reading is not configured yet." }, 500);

    const { data: file, error: dlError } = await db.storage.from("sprint-verification").download(docPath);
    if (dlError || !file) return json({ error: "That upload could not be opened." }, 400);

    const mime = file.type || "application/octet-stream";
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > 15 * 1024 * 1024) {
      await db.storage.from("sprint-verification").remove([docPath]);
      return json({ error: "That file is over 15MB — try a smaller export or a photo." }, 400);
    }

    let verdict: Verdict;
    try {
      verdict = await readDocument(
        apiKey,
        base64(bytes),
        mime,
        docPath.split("/").pop() ?? "report",
        sprint,
      );
    } finally {
      // The document never lives past the read. Only the number, the verdict
      // and where it was found survive — the report itself is not ours to keep.
      const { error: rmError } = await db.storage.from("sprint-verification").remove([docPath]);
      if (rmError) console.error("sprint-verify: purge failed:", rmError.message);
      else console.log("sprint-verify: verification document purged after read");
    }

    const { data: updated, error } = await db
      .from("team_goals")
      .update({
        ...stamp,
        status: verdict.supported ? "won" : "missed",
        verification_doc_path: null,
        ai_verdict: verdict,
        verification_note: note || null,
      })
      .eq("id", goalId)
      .select("*")
      .single();
    if (error) throw error;


    return json({ ok: true, sprint: updated, verdict });
  } catch (e) {
    console.error("sprint-verify failed:", (e as Error).message);
    return json({ error: (e as Error).message || "Verification could not run." }, 500);
  }
});
