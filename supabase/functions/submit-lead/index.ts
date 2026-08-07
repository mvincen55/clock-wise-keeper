// Public early-access inquiry handler for the Purple Envelope website.
//
// Runs with the service role because `marketing_leads` grants nothing to anon
// or authenticated — public visitors can write only through this function and
// can never read submissions back. No third-party CRM, no trackers.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const SITE_NAME = 'Purple Envelope'
const SENDER_DOMAIN = 'notify.purpleenvelope.app'
const FROM_DOMAIN = 'purpleenvelope.app'

// Abuse limits for an unauthenticated public form.
const MAX_PER_IP_PER_HOUR = 5
const MAX_PER_EMAIL_PER_DAY = 3

const LIMITS = {
  name: 120,
  practice_name: 160,
  role: 60,
  office_size: 60,
  email: 254,
  note: 2000,
} as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function hash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  // Honeypot: a hidden field only a bot fills in. Accept and discard.
  if (str(body.company_website, 200)) return json({ ok: true })

  const name = str(body.name, LIMITS.name)
  const email = str(body.email, LIMITS.email).toLowerCase()
  const practice_name = str(body.practice_name, LIMITS.practice_name)
  const role = str(body.role, LIMITS.role)
  const office_size = str(body.office_size, LIMITS.office_size)
  const note = str(body.note, LIMITS.note)

  const fieldErrors: Record<string, string> = {}
  if (name.length < 2) fieldErrors.name = 'Please tell us your name.'
  if (!EMAIL_RE.test(email)) fieldErrors.email = 'Please enter a valid email address.'
  if (Object.keys(fieldErrors).length > 0) return json({ error: 'Please check the form.', fieldErrors }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.error('submit-lead: missing service configuration')
    return json({ error: 'This form is temporarily unavailable. Please try again shortly.' }, 503)
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const forwarded = req.headers.get('x-forwarded-for') ?? ''
  const ip = forwarded.split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown'
  const ip_hash = await hash(ip)
  const user_agent = str(req.headers.get('user-agent'), 300)

  // Rate limiting: per visitor per hour and per email address per day.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ count: ipCount }, { count: emailCount }] = await Promise.all([
    supabase
      .from('marketing_leads')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ip_hash)
      .gte('created_at', hourAgo),
    supabase
      .from('marketing_leads')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', dayAgo),
  ])

  if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR || (emailCount ?? 0) >= MAX_PER_EMAIL_PER_DAY) {
    return json(
      { error: 'We already have a recent message from you. Give us a little time to reply before sending another.' },
      429,
    )
  }

  const { data: lead, error } = await supabase
    .from('marketing_leads')
    .insert({ name, email, practice_name, role, office_size, note, ip_hash, user_agent, source: 'website' })
    .select('id')
    .single()

  if (error) {
    console.error('submit-lead: insert failed', error)
    return json({ error: 'We could not record that. Please try again, or email us directly.' }, 500)
  }

  // Best-effort notification through the existing Purple Envelope email queue.
  // The destination is a configured secret; with none set the inquiry is still
  // stored and nothing is sent to an invented inbox.
  const destination = Deno.env.get('LEAD_NOTIFICATION_EMAIL')
  if (destination) {
    const rows: [string, string][] = [
      ['Name', name],
      ['Email', email],
      ['Practice', practice_name || '—'],
      ['Role', role || '—'],
      ['Office size', office_size || '—'],
    ]
    const html = `<div style="font-family:Arial,sans-serif;color:#1b1622">
      <h2 style="font-weight:500">New early-access inquiry</h2>
      <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
        ${rows.map(([k, v]) => `<tr><td style="color:#5b5566">${k}</td><td>${escapeHtml(v)}</td></tr>`).join('')}
      </table>
      <p style="font-size:14px;white-space:pre-wrap">${escapeHtml(note || '(no note)')}</p>
      <p style="font-size:12px;color:#5b5566">Reference ${lead.id}</p>
    </div>`
    const text = `New early-access inquiry\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${note || '(no note)'}\n\nReference ${lead.id}`

    const { error: queueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: `lead-${lead.id}`,
        to: destination,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: `Early access inquiry — ${practice_name || name}`,
        html,
        text,
        purpose: 'transactional',
        label: 'early-access-inquiry',
        queued_at: new Date().toISOString(),
      },
    })
    if (queueError) console.error('submit-lead: notification enqueue failed', queueError)
  }

  return json({ ok: true, id: lead.id })
})
