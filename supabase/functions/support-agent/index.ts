// support-agent — the "Report a problem" help desk.
//
// Two tiers, on purpose:
//   standard — a fast, cheap model that handles the common stuff (how do I…,
//              I can't find…, my punch looks wrong). Most reports end here.
//   senior   — the strongest reasoning model we have. Only runs when the
//              member (or the standard tier) says this is a real problem.
//
// The agent can actually look things up: the member's recent punches, today's
// attendance, their open requests, and the office's own standing rules. It
// never guesses, and it never touches message content or patient data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { OFFICE_DOCTRINE } from "../_shared/office-doctrine.ts";
import { guardAiInput, JAILBREAK_REFUSAL } from "../_shared/jailbreak-guard.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Tier 1: fast and cheap, handles the everyday reports.
const STANDARD_MODEL = "google/gemini-3.6-flash";
// Tier 2: the expensive one. Only on escalation.
const SENIOR_MODEL = "openai/gpt-5.5";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPPORT_RULES = `YOU ARE THE HELP DESK for Purple Envelope, the practice-operations app this office runs on (time clock, PTO, schedules, attendance, checklists, goals, training, messages, reports).

Someone just hit "Report a problem" from inside the app. They may be confused, blocked, or looking at something that genuinely looks wrong.

HOW YOU HELP:
1. Read what they said and any screenshot they sent. If a screenshot is attached, describe what you can actually see in it before you diagnose.
2. Use the CONTEXT block below — their role, the page they were on, their recent punches and requests. That is real data. Cite it: "your clock-out on Jul 28 is recorded at 2:52 PM Eastern".
3. Give the fix in the fewest steps possible. Name the actual page and button ("Timesheet → the three dots on that row → Request correction").
4. If it is a data problem you can see in the context, say plainly what the data shows and what it should be.

HARD LIMITS:
- You cannot change any data. You cannot edit punches, approve requests, or fix anything yourself. Never say you fixed something or that you "will take care of it".
- Never invent a page, button, feature, or number. If you do not know, say you do not know and that this should go to the owner.
- Never repeat patient information. Never comment on anyone's performance.

WHEN TO HAND IT UP:
If this looks like a real bug, a payroll-affecting error, a permission problem, or anything you cannot resolve in a step or two, end your answer with exactly this line on its own:
ESCALATE: <one short line saying what the real problem appears to be>
Only include that line when you mean it. Do not escalate a simple how-do-I question.

TONE: short. Two to five sentences, or a tight numbered list. No preamble, no apology theatre. Plain and useful.`;

const SENIOR_RULES = `YOU ARE THE SENIOR ENGINEER on this help desk. The first-tier agent could not resolve this, or the member said it is a real problem. You are the expensive call — act like it.

WHAT CHANGES AT YOUR TIER:
- Reason it through properly before answering. Consider what the data in CONTEXT actually proves versus what it merely suggests, and consider the timezone: this app stores UTC and displays Eastern, which is the single most common source of "the time is wrong" reports.
- Separate three things explicitly: (a) what is definitely true from the data, (b) the most likely cause, (c) what would confirm it.
- If it is a genuine defect in the app, say so plainly and describe it precisely enough that a developer could act on it — which page, which action, what was expected, what happened.
- If it is a data problem, say exactly which record is wrong and what it should be, so a manager can correct it through the proper flow.
- If the member simply misread the screen, say that kindly and briefly.

You still cannot change anything. You never invent data, pages, or numbers. Same tone: calm, plain, short — but here, complete.

End with a "Bottom line:" sentence a busy owner can read on its own.`;

type Msg = { role: string; content: unknown };

/** Everything the agent is allowed to know about this person's situation. */
async function buildContext(
  db: ReturnType<typeof createClient>,
  orgId: string,
  userId: string,
  role: string,
  pagePath: string,
): Promise<string> {
  const parts: string[] = [
    `Reporter role: ${role}`,
    `Page they were on: ${pagePath || "unknown"}`,
    `Now (Eastern): ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}`,
  ];

  const { data: employee } = await db
    .from("employees")
    .select("id, display_name, preferred_name, team")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!employee) {
    parts.push("No employee record is linked to this login.");
    return parts.join("\n");
  }

  parts.push(`Reporter: ${employee.preferred_name ?? employee.display_name ?? "unknown"}`);
  if (employee.team) parts.push(`Team: ${employee.team}`);

  const east = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-US", {
          timeZone: "America/New_York",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "\u2014";

  const { data: punches } = await db
    .from("punches")
    .select("punch_type, punch_time, source, is_edited")
    .eq("employee_id", employee.id)
    .order("punch_time", { ascending: false })
    .limit(12);

  if (punches?.length) {
    parts.push(
      "Recent punches (shown in Eastern, stored UTC \u2014 newest first):\n" +
        punches
          .map(
            (p) =>
              `  ${p.punch_type} ${east(p.punch_time as string)} (${p.source ?? "app"}${p.is_edited ? ", edited" : ""})`,
          )
          .join("\n"),
    );
  }

  const { data: attendance } = await db
    .from("attendance_day_status")
    .select("entry_date, status_code, is_late, minutes_late, is_absent, is_incomplete, office_closed")
    .eq("employee_id", employee.id)
    .order("entry_date", { ascending: false })
    .limit(7);

  if (attendance?.length) {
    parts.push(
      "Recent attendance days:\n" +
        attendance
          .map((a) => {
            const flags = [
              a.is_late ? `late ${a.minutes_late ?? "?"}m` : null,
              a.is_absent ? "absent" : null,
              a.is_incomplete ? "incomplete punches" : null,
              a.office_closed ? "office closed" : null,
            ].filter(Boolean);
            return `  ${a.entry_date}: ${a.status_code ?? "\u2014"}${flags.length ? ` (${flags.join(", ")})` : ""}`;
          })
          .join("\n"),
    );
  }

  const { data: pto } = await db
    .from("pto_requests")
    .select("start_date, end_date, status, hours_requested, pto_type")
    .eq("employee_id", employee.id)
    .order("start_date", { ascending: false })
    .limit(5);

  if (pto?.length) {
    parts.push(
      "Recent time-off requests:\n" +
        pto
          .map(
            (p) =>
              `  ${p.start_date} \u2192 ${p.end_date}: ${p.pto_type ?? "PTO"} \u2014 ${p.status} (${p.hours_requested ?? "?"}h)`,
          )
          .join("\n"),
    );
  }

  return parts.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const ticketId = typeof body.ticket_id === "string" ? body.ticket_id : "";
    const tier = body.tier === "senior" ? "senior" : "standard";
    if (!ticketId) return json({ error: "Which report is this?" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Sign in to report a problem." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: auth } = await asUser.auth.getUser();
    const user = auth?.user;
    if (!user) return json({ error: "Sign in to report a problem." }, 401);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: ticket } = await db
      .from("support_tickets")
      .select("id, org_id, user_id, page_path, status, category, severity, range_start, range_end")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) return json({ error: "That report no longer exists." }, 404);

    const { data: member } = await db
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    const isAdmin = member && ["owner", "manager"].includes(String(member.role));
    if (ticket.user_id !== user.id && !isAdmin) {
      return json({ error: "That is not your report." }, 403);
    }
    const orgId = String(ticket.org_id);

    const { data: rows } = await db
      .from("support_messages")
      .select("role, content, attachment_path, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true })
      .limit(30);

    const history = rows ?? [];
    const lastUser = [...history].reverse().find((m) => m.role === "user");
    if (!lastUser) return json({ error: "Tell me what went wrong first." }, 400);

    if (
      await guardAiInput({
        orgId,
        actorUserId: user.id,
        surface: `support-agent:${tier}`,
        input: String(lastUser.content ?? ""),
      })
    ) {
      return json({ answer: JAILBREAK_REFUSAL, escalate: null });
    }

    const context = await buildContext(
      db,
      orgId,
      String(ticket.user_id),
      String(member?.role ?? "employee"),
      String(ticket.page_path ?? ""),
    ) + [
      "",
      "WHAT THEY PICKED WHEN REPORTING:",
      `- Area: ${ticket.category ?? "not set"}`,
      `- How bad: ${ticket.severity ?? "not set"}`,
      ticket.range_start || ticket.range_end
        ? `- Dates involved: ${ticket.range_start ?? "?"} to ${ticket.range_end ?? "?"}`
        : "- Dates involved: not set",
      "Focus your checking on that area and those dates first.",
    ].join("\n");

    // Screenshots live in a private bucket — hand the model a short-lived
    // signed URL rather than the raw file.
    const signedFor = async (path: string | null) => {
      if (!path) return null;
      const { data } = await db.storage.from("support-attachments").createSignedUrl(path, 600);
      return data?.signedUrl ?? null;
    };

    const messages: Msg[] = [
      {
        role: "system",
        content:
          `${OFFICE_DOCTRINE}\n\n---\n\n${tier === "senior" ? SENIOR_RULES : SUPPORT_RULES}\n\n---\n\nCONTEXT (real data — cite it, never contradict it):\n${context}`,
      },
    ];

    for (const m of history) {
      const path = m.role === "user" ? (m.attachment_path as string | null) : null;
      const isImage = !!path && /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(path);
      const shot = isImage ? await signedFor(path) : null;
      if (shot) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text: String(m.content ?? "(screenshot)") },
            { type: "image_url", image_url: { url: shot } },
          ],
        });
      } else {
        messages.push({
          role: m.role === "assistant" ? "assistant" : "user",
          content:
            String(m.content ?? "") + (path && !isImage ? " (a non-image file was attached)" : ""),
        });
      }
    }


    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "The help desk is not configured yet." }, 500);

    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: tier === "senior" ? SENIOR_MODEL : STANDARD_MODEL,
        max_completion_tokens: tier === "senior" ? 1400 : 700,
        messages,
      }),
    });

    if (res.status === 429) {
      return json({ error: "The help desk is busy right now — try again in a minute." }, 429);
    }
    if (res.status === 402) {
      return json({ error: "AI credits are exhausted. Add credits to keep the help desk running." }, 402);
    }
    if (!res.ok) {
      return json({ error: "The help desk could not answer just now." }, 502);
    }

    const data = await res.json();
    let answer = String(data?.choices?.[0]?.message?.content ?? "").trim();
    if (!answer) return json({ error: "The help desk came back empty. Try again." }, 502);

    // The standard tier can raise its hand.
    let suggestEscalation: string | null = null;
    const match = answer.match(/^ESCALATE:\s*(.+)$/m);
    if (match) {
      suggestEscalation = match[1].trim();
      answer = answer.replace(/^ESCALATE:.*$/m, "").trim();
    }

    await db.from("support_messages").insert({
      ticket_id: ticketId,
      org_id: orgId,
      role: "assistant",
      content: answer,
      tier,
    });

    await db
      .from("support_tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    return json({ answer, tier, escalate: suggestEscalation });
  } catch (e) {
    console.error("support-agent", e);
    return json({ error: "Something went wrong on the help desk." }, 500);
  }
});
