import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { pdfBase64, filename } = await req.json();
    if (!pdfBase64) throw new Error("No PDF data provided");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Use Gemini with vision to extract data from the PDF
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a time punch report parser. Extract structured data from time punch and payroll PDF reports.

Return a JSON object with this exact structure:
{
  "report_type": "time_punch" | "payroll",
  "company_name": "string or null",
  "report_range_start": "YYYY-MM-DD or null",
  "report_range_end": "YYYY-MM-DD or null",
  "employees": [
    {
      "name": "string",
      "code": "string or null",
      "entries": [
        {
          "date": "YYYY-MM-DD",
          "punches": ["HH:MM AM/PM", ...],
          "total_hhmm": "HH:MM",
          "notes": ["note line 1", ...]
        }
      ],
      "payroll_total_hhmm": "HH:MM or null"
    }
  ]
}

Rules:
- Parse all dates to YYYY-MM-DD format
- Parse all times as "HH:MM AM/PM" strings  
- Parse total hours as "HH:MM" format
- Include ALL note lines (audit trail entries like "The punch time X was added/changed/deleted by...")
- If it's a payroll report, include the total hours worked
- Return ONLY valid JSON, no markdown or explanation`
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: filename || "report.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
              {
                type: "text",
                text: "Extract all time punch data from this PDF report. Return the structured JSON only.",
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage credits exhausted. Please top up in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from response (strip markdown code fences if present)
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // Store raw text as fallback
      return new Response(
        JSON.stringify({
          success: false,
          raw_text: content,
          error: "Could not parse AI response as structured data. Raw text stored for review.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .insert({
        user_id: user.id,
        filename: filename || "uploaded.pdf",
        status: "previewing",
        report_range_start: parsed.report_range_start || null,
        report_range_end: parsed.report_range_end || null,
        source_type: parsed.report_type || "unknown",
        company_name: parsed.company_name || null,
        raw_text: content,
      })
      .select("id")
      .single();

    if (importError) throw importError;

    // Create import rows for preview
    const rows: any[] = [];
    for (const emp of parsed.employees || []) {
      for (const entry of emp.entries || []) {
        rows.push({
          import_id: importRecord.id,
          employee_name: emp.name,
          employee_code: emp.code || null,
          entry_date: entry.date,
          punch_times: entry.punches || [],
          total_hhmm: entry.total_hhmm || null,
          note_lines: entry.notes || [],
          raw_text: JSON.stringify(entry),
          status: "pending",
        });
      }

      // If payroll total exists, add a summary row
      if (emp.payroll_total_hhmm) {
        rows.push({
          import_id: importRecord.id,
          employee_name: emp.name,
          employee_code: emp.code || null,
          entry_date: null,
          punch_times: [],
          total_hhmm: emp.payroll_total_hhmm,
          note_lines: ["PAYROLL TOTAL"],
          raw_text: JSON.stringify({ payroll_total: emp.payroll_total_hhmm }),
          status: "pending",
        });
      }
    }

    if (rows.length > 0) {
      const { error: rowsError } = await supabase.from("import_rows").insert(rows);
      if (rowsError) throw rowsError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        import_id: importRecord.id,
        row_count: rows.length,
        report_type: parsed.report_type,
        company_name: parsed.company_name,
        range: `${parsed.report_range_start || "?"} to ${parsed.report_range_end || "?"}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("parse-pdf error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
