import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ReturnType<typeof createClient> resolves the parameterless overload,
// whose tables type as never; alias the real call's inferred client type.
const makeDbClient = (url: string, key: string) => createClient(url, key);
type DbClient = ReturnType<typeof makeDbClient>;
import { chunkText, normalizeText } from "../_shared/doc-chunking.ts";
import { validateStructured, type StructuredChunkRow } from "./structured.ts";

// Ingest an office document (policy / HR / insurance manual) for the
// readers and the AI assistant. Two ingestion paths:
//
//   STRUCTURED (insurance manuals, new): the client parses the PDF
//   locally — layout-aware, deterministic — and sends typed chunks with
//   page/section provenance plus a parse report. The server validates,
//   stores the original PDF, and writes the chunks. Re-parses land as a
//   NEW parse_version next to the old rows and are only promoted after
//   the insert fully succeeds; the previous version stays for rollback.
//
//   LEGACY (everything else, unchanged): plain text is chunked directly;
//   PDFs without a structured payload go through AI transcription.
//
// Internal business documents only — the UI warns staff not to upload
// patient records.

async function extractPdfTextViaAI(base64: string, filename: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("Server configuration error");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Transcribe the provided PDF into clean, well-structured Markdown. Merge hard-wrapped lines back into full paragraphs. Use #/##/### headings matching the document's own hierarchy, - for bullet points (keep each bullet's wrapped lines on one line), and 1. for numbered lists. Preserve reading order and ALL substantive text verbatim. Drop page numbers, repeated page headers/footers, and stray artifacts. No commentary, no code fences — output only the Markdown document." },
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
// Base64 inflates the file ~4/3; a structured parse rides alongside it.
const MAX_REQUEST_BYTES = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8 * 1024 * 1024;
const CHUNK_INSERT_BATCH = 200;

const CATEGORIES = new Set(["policy", "hr", "insurance", "other"]);
const LIBRARY_AREAS = new Set(["workplace", "playbook", "shared", "unassigned"]);
const COLLECTIONS = new Set([
  "handbook",
  "hr",
  "insurance",
  "operations",
  "training",
  "reference",
  "other",
]);

/** Legacy flat category kept in sync with the collection. */
function legacyCategoryFor(collection: string): string {
  if (collection === "handbook") return "policy";
  if (collection === "hr" || collection === "insurance") return collection;
  return "other";
}

const asDate = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
};

const asLabel = (value: unknown, cap = 120): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, cap);
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Batched insert; returns the first error encountered (null on success). */
async function insertChunks(
  supabase: DbClient,
  rows: Record<string, unknown>[]
): Promise<unknown> {
  for (let i = 0; i < rows.length; i += CHUNK_INSERT_BATCH) {
    const { error } = await supabase
      .from("office_doc_chunks")
      .insert(rows.slice(i, i + CHUNK_INSERT_BATCH));
    if (error) return error;
  }
  return null;
}

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

    // Reject oversized requests BEFORE reading the body — an unbounded
    // base64 string would exhaust memory first.
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return json({ error: "Request too large (files max 8 MB)" }, 413);
    }

    const body = await req.json();
    const mode: "create" | "reparse" | "rollback" =
      body.mode === "reparse" ? "reparse" : body.mode === "rollback" ? "rollback" : "create";

    // ---------------------------------------------------------------
    // Re-parse an existing document: new chunks land as the next
    // parse_version and are promoted only after every row is in.
    // ---------------------------------------------------------------
    if (mode === "reparse") {
      if (!isUuid(body.doc_id)) return json({ error: "Missing doc_id" }, 400);
      const { data: doc } = await supabase
        .from("office_docs")
        .select("id, org_id, current_parse_version, parse_status, parse_confidence, page_count, section_count, parse_meta, char_count")
        .eq("id", body.doc_id)
        .maybeSingle();
      if (!doc) return json({ error: "Document not found" }, 404);

      let structured;
      try {
        structured = validateStructured(body.structured);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Invalid structured parse" }, 422);
      }

      const currentVersion = doc.current_parse_version ?? 1;
      const newVersion = currentVersion + 1;
      const rows = structured.chunks.map((c: StructuredChunkRow) => ({
        ...c,
        doc_id: doc.id,
        org_id: orgId,
        parse_version: newVersion,
      }));
      const insertError = await insertChunks(supabase, rows);
      if (insertError) {
        // The failed version never becomes current; clear the partial rows.
        await supabase
          .from("office_doc_chunks")
          .delete()
          .eq("doc_id", doc.id)
          .eq("parse_version", newVersion);
        console.error("ingest-doc reparse insert error:", insertError);
        return json({ error: "Indexing failed — the previous version is untouched" }, 500);
      }

      const { error: promoteError } = await supabase
        .from("office_docs")
        .update({
          current_parse_version: newVersion,
          parse_status: structured.navMode === "pages" ? "fallback" : "parsed",
          parse_confidence: structured.confidence,
          page_count: structured.pageCount || null,
          section_count: structured.sectionCount || null,
          char_count: structured.charCount,
          parse_meta: {
            ...structured.parseMeta,
            // What the reader replaced — restored wholesale on rollback.
            previous: {
              parse_version: currentVersion,
              parse_status: doc.parse_status,
              parse_confidence: doc.parse_confidence,
              page_count: doc.page_count,
              section_count: doc.section_count,
              char_count: doc.char_count,
              parse_meta: doc.parse_meta ?? null,
            },
          },
        })
        .eq("id", doc.id);
      if (promoteError) {
        await supabase
          .from("office_doc_chunks")
          .delete()
          .eq("doc_id", doc.id)
          .eq("parse_version", newVersion);
        console.error("ingest-doc promote error:", promoteError);
        return json({ error: "Could not publish the new parse" }, 500);
      }

      // Keep exactly one older version for rollback; prune the rest.
      await supabase
        .from("office_doc_chunks")
        .delete()
        .eq("doc_id", doc.id)
        .lt("parse_version", currentVersion);

      return json({
        id: doc.id,
        parse_version: newVersion,
        chunks: rows.length,
        sections: structured.sectionCount,
        confidence: structured.confidence,
        nav_mode: structured.navMode,
      });
    }

    // ---------------------------------------------------------------
    // Roll back to the previous stored extraction.
    // ---------------------------------------------------------------
    if (mode === "rollback") {
      if (!isUuid(body.doc_id)) return json({ error: "Missing doc_id" }, 400);
      const { data: doc } = await supabase
        .from("office_docs")
        .select("id, current_parse_version, parse_meta")
        .eq("id", body.doc_id)
        .maybeSingle();
      if (!doc) return json({ error: "Document not found" }, 404);
      const current = doc.current_parse_version ?? 1;

      const { data: versions } = await supabase
        .from("office_doc_chunks")
        .select("parse_version")
        .eq("doc_id", doc.id)
        .lt("parse_version", current)
        .order("parse_version", { ascending: false })
        .limit(1);
      const previous = versions?.[0]?.parse_version;
      if (previous === undefined) {
        return json({ error: "No previous extraction is stored for this document" }, 409);
      }

      const prior = ((doc.parse_meta as Record<string, unknown> | null)?.previous ??
        {}) as Record<string, unknown>;
      const { error: restoreError } = await supabase
        .from("office_docs")
        .update({
          current_parse_version: previous,
          parse_status: prior.parse_status ?? "legacy",
          parse_confidence: prior.parse_confidence ?? null,
          page_count: prior.page_count ?? null,
          section_count: prior.section_count ?? null,
          char_count: prior.char_count ?? 0,
          parse_meta: prior.parse_meta ?? null,
        })
        .eq("id", doc.id);
      if (restoreError) {
        console.error("ingest-doc rollback error:", restoreError);
        return json({ error: "Rollback failed" }, 500);
      }
      // Drop the abandoned version so a future re-parse starts clean.
      await supabase
        .from("office_doc_chunks")
        .delete()
        .eq("doc_id", doc.id)
        .eq("parse_version", current);
      return json({ id: doc.id, parse_version: previous });
    }

    // ---------------------------------------------------------------
    // Create a new document (structured or legacy).
    // ---------------------------------------------------------------
    const title = String(body.title ?? "").trim();
    const libraryArea = LIBRARY_AREAS.has(body.library_area) ? body.library_area : "unassigned";
    const collection = COLLECTIONS.has(body.collection) ? body.collection : "other";
    const category = CATEGORIES.has(body.category)
      ? body.category
      : legacyCategoryFor(collection);
    if (!title) return json({ error: "Missing title" }, 400);

    const carrier = asLabel(body.carrier);
    const manualType = asLabel(body.manual_type, 60);
    const effectiveDate = asDate(body.effective_date);
    const replacesDocId = isUuid(body.replaces_doc_id) ? body.replaces_doc_id : null;

    let structured: ReturnType<typeof validateStructured> | null = null;
    if (body.structured) {
      try {
        structured = validateStructured(body.structured);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Invalid structured parse" }, 422);
      }
    }

    let text = "";
    let filePath: string | null = null;
    let mimeType: string | null = null;

    if (typeof body.file_path === "string" && body.file_path) {
      // The client already uploaded the original to storage (RLS keys the
      // folder to the org and to admins) — the function call carries only
      // the structured parse. Never accept a path outside this org.
      if (!body.file_path.startsWith(`${orgId}/`) || body.file_path.length > 300) {
        return json({ error: "Invalid file path" }, 400);
      }
      if (!structured) {
        return json({ error: "A pre-uploaded file needs a structured parse" }, 400);
      }
      filePath = body.file_path;
      mimeType = String(body.contentType ?? "application/pdf");
    } else if (typeof body.base64 === "string" && body.base64) {
      if (body.base64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 64 * 1024) {
        return json({ error: "File too large (max 8 MB)" }, 400);
      }
      const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
      if (bytes.length > MAX_FILE_BYTES) return json({ error: "File too large (max 8 MB)" }, 400);
      mimeType = String(body.contentType ?? "application/octet-stream");

      if (structured) {
        // Structured path: the client already parsed this file; the server
        // only stores the original for the source-page viewer.
      } else if (mimeType === "application/pdf") {
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
      if (uploadError) {
        console.error("ingest-doc upload error:", uploadError);
        return json({ error: "Could not store the file" }, 500);
      }
    } else if (typeof body.text === "string" && body.text.trim()) {
      text = normalizeText(body.text);
      mimeType = "text/plain";
    } else if (!structured) {
      return json({ error: "Provide either text or base64 file content" }, 400);
    }

    if (!structured && !text) {
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
        library_area: libraryArea,
        collection,
        file_path: filePath,
        mime_type: mimeType,
        char_count: structured ? structured.charCount : text.length,
        uploaded_by: user.id,
        carrier,
        manual_type: manualType,
        effective_date: effectiveDate,
        replaces_doc_id: replacesDocId,
        ...(structured
          ? {
              parse_status: structured.navMode === "pages" ? "fallback" : "parsed",
              parse_confidence: structured.confidence,
              page_count: structured.pageCount || null,
              section_count: structured.sectionCount || null,
              parse_meta: structured.parseMeta,
            }
          : {}),
      })
      .select("id")
      .single();
    if (docError) {
      console.error("ingest-doc save error:", docError);
      if (filePath) await supabase.storage.from("office-docs").remove([filePath]);
      return json({ error: "Save failed" }, 500);
    }

    const rows = structured
      ? structured.chunks.map((c: StructuredChunkRow) => ({
          ...c,
          doc_id: doc.id,
          org_id: orgId,
          parse_version: 1,
        }))
      : chunkText(text).map((content, i) => ({
          doc_id: doc.id,
          org_id: orgId,
          chunk_index: i,
          content,
        }));
    const chunkError = await insertChunks(supabase, rows);
    if (chunkError) {
      await supabase.from("office_docs").delete().eq("id", doc.id);
      if (filePath) await supabase.storage.from("office-docs").remove([filePath]);
      console.error("ingest-doc chunk error:", chunkError);
      return json({ error: "Indexing failed" }, 500);
    }

    // Only after the new manual is fully stored does the one it replaces
    // move to the archive — never silently, never destructively.
    if (replacesDocId) {
      const { error: archiveError } = await supabase
        .from("office_docs")
        .update({ doc_status: "archived" })
        .eq("id", replacesDocId)
        .eq("org_id", orgId);
      if (archiveError) console.error("ingest-doc archive error:", archiveError);
    }

    return json({
      id: doc.id,
      chunks: rows.length,
      chars: structured ? structured.charCount : text.length,
      ...(structured
        ? {
            sections: structured.sectionCount,
            confidence: structured.confidence,
            nav_mode: structured.navMode,
          }
        : {}),
    });
  } catch (error) {
    console.error("ingest-doc error:", error);
    return json({ error: "Unexpected error" }, 500);
  }
});
