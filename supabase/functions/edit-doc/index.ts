// Edit a library document's text in place (Office Handbook / Insurance
// Desk). The OWNER may always edit; MANAGERS only when the owner has
// enabled it in doc_library_settings. The new text is re-chunked with the
// same splitter ingest-doc uses, so search, Ask AI, and the reader all see
// the updated content immediately. Internal business documents only —
// never patient records.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chunkText, normalizeText } from "../_shared/doc-chunking.ts";

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

// Well above the largest extracted document (the big carrier manual is
// ~480k chars) while still bounding the request.
const MAX_TEXT_CHARS = 800_000;

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
      return json({ error: "Only owners and managers can edit documents" }, 403);
    }
    if (membership.role === "manager") {
      const { data: settings } = await supabase
        .from("doc_library_settings")
        .select("managers_can_edit")
        .eq("org_id", membership.org_id)
        .maybeSingle();
      if (!settings?.managers_can_edit) {
        return json({ error: "The owner has not enabled document editing for managers" }, 403);
      }
    }

    const body = await req.json();
    const docId = String(body.doc_id ?? "");
    const rawText = typeof body.text === "string" ? body.text : "";
    if (!docId) return json({ error: "Missing doc_id" }, 400);
    if (rawText.length > MAX_TEXT_CHARS) return json({ error: "Text too large" }, 413);
    const text = normalizeText(rawText);
    if (!text) return json({ error: "The document text cannot be empty" }, 400);

    // RLS scopes this read to the caller's org.
    const { data: doc } = await supabase
      .from("office_docs")
      .select("id, org_id")
      .eq("id", docId)
      .maybeSingle();
    if (!doc) return json({ error: "Document not found" }, 404);

    // Keep the previous chunks in hand so a failed re-index can restore
    // them instead of leaving the document empty.
    const { data: oldChunks, error: oldError } = await supabase
      .from("office_doc_chunks")
      .select("chunk_index, content")
      .eq("doc_id", doc.id)
      .order("chunk_index");
    if (oldError) {
      console.error("edit-doc read error:", oldError);
      return json({ error: "Could not read the current document" }, 500);
    }

    const chunks = chunkText(text);
    const rows = chunks.map((content, i) => ({
      doc_id: doc.id,
      org_id: doc.org_id,
      chunk_index: i,
      content,
    }));

    const { error: deleteError } = await supabase
      .from("office_doc_chunks")
      .delete()
      .eq("doc_id", doc.id);
    if (deleteError) {
      console.error("edit-doc delete error:", deleteError);
      return json({ error: "Save failed" }, 500);
    }

    const { error: insertError } = await supabase.from("office_doc_chunks").insert(rows);
    if (insertError) {
      console.error("edit-doc insert error:", insertError);
      // Put the previous content back rather than leaving the doc blank.
      await supabase.from("office_doc_chunks").insert(
        (oldChunks ?? []).map((c) => ({
          doc_id: doc.id,
          org_id: doc.org_id,
          chunk_index: c.chunk_index,
          content: c.content,
        }))
      );
      return json({ error: "Save failed — the previous version was kept" }, 500);
    }

    // updated_at refreshes via trigger.
    const { error: updateError } = await supabase
      .from("office_docs")
      .update({ char_count: text.length })
      .eq("id", doc.id);
    if (updateError) console.error("edit-doc meta update error:", updateError);

    return json({ id: doc.id, chunks: chunks.length, chars: text.length });
  } catch (error) {
    console.error("edit-doc error:", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
