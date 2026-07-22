import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chunkText, normalizeText } from "./lib.ts";

async function extractPdfTextViaAI(base64: string, filename: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("Server configuration error");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Extract all readable text from the provided PDF. Return plain text only, preserving paragraph breaks. No commentary, no markdown." },
        { role: "user", content: [
          { type: "file", file: { filename, file_data: `data:application/pdf;base64,${base64}` } },
          { type: "text", text: "Extract the full text of this document." },
        ] },
      ],
      temperature: 0,
      max_tokens: 65000,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI extract error", resp.status, t);
    throw new Error("PDF text extraction failed");
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// Ingest an office document (policy / HR / insurance handbook) for the AI
// assistant: extract text, store the original in the office-docs bucket,
// and index chunked text for full-text retrieval. Internal business
// documents only — the UI warns staff not to upload patient records.

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

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const CATEGORIES = new Set(["policy", "hr", "insurance", "other"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (!membership) return json({ error: "No active organization membership" }, 403);
    if (membership.role !== "owner" && membership.role !== "manager") {
      return json({ error: "Only managers can add documents" }, 403);
    }
    const orgId = membership.org_id;

    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const category = CATEGORIES.has(body.category) ? body.category : "other";
    if (!title) return json({ error: "Missing title" }, 400);

    let text = "";
    let filePath: string | null = null;
    let mimeType: string | null = null;

    if (typeof body.text === "string" && body.text.trim()) {
      text = normalizeText(body.text);
      mimeType = "text/plain";
    } else if (typeof body.base64 === "string" && body.base64) {
      const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
      if (bytes.length > MAX_FILE_BYTES) return json({ error: "File too large (max 8 MB)" }, 400);
      mimeType = String(body.contentType ?? "application/octet-stream");

      if (mimeType === "application/pdf") {
        const raw = await extractPdfTextViaAI(body.base64, String(body.filename ?? "document.pdf"));
        text = normalizeText(raw);
      } else if (mimeType.startsWith("text/") || mimeType === "application/octet-stream") {
        text = normalizeText(new TextDecoder().decode(bytes));
      } else {
        return json({ error: `Unsupported file type: ${mimeType}` }, 400);
      }

      const safeName = String(body.filename ?? "document")
        .replace(/[^A-Za-z0-9._-]+/g, "_")
        .slice(0, 120);
      filePath = `${orgId}/${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("office-docs")
        .upload(filePath, bytes, { contentType: mimeType });
      if (uploadError) return json({ error: `Upload failed: ${uploadError.message}` }, 500);
    } else {
      return json({ error: "Provide either text or base64 file content" }, 400);
    }

    if (!text) {
      return json(
        { error: "No text could be extracted. If this is a scanned PDF, paste the text instead." },
        422
      );
    }

    const { data: doc, error: docError } = await supabase
      .from("office_docs")
      .insert({
        org_id: orgId,
        title,
        category,
        file_path: filePath,
        mime_type: mimeType,
        char_count: text.length,
        uploaded_by: user.id,
      })
      .select("id")
      .single();
    if (docError) return json({ error: `Save failed: ${docError.message}` }, 500);

    const chunks = chunkText(text);
    const { error: chunkError } = await supabase.from("office_doc_chunks").insert(
      chunks.map((content, i) => ({
        doc_id: doc.id,
        org_id: orgId,
        chunk_index: i,
        content,
      }))
    );
    if (chunkError) {
      await supabase.from("office_docs").delete().eq("id", doc.id);
      return json({ error: `Indexing failed: ${chunkError.message}` }, 500);
    }

    return json({ id: doc.id, chunks: chunks.length, chars: text.length });
  } catch (error) {
    console.error("ingest-doc error:", error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
