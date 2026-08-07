import { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Shell } from '@/marketing/primitives';
import { EnvelopeMark } from '@/marketing/EnvelopeMark';
import { Loader2 } from 'lucide-react';

/**
 * Early-access intake.
 *
 * Backed by the `submit-lead` edge function (service-role writes into the
 * isolated `marketing_leads` table; honeypot + per-IP/per-email rate limits
 * live server-side). The browser can never read the table back.
 */
const SIZES = ['1 doctor', '2 doctors', '3+ doctors'];
const ROLES = ['Owner / dentist', 'Office manager', 'Team member', 'Something else'];

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-lead`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const LABEL = 'font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft';
const FIELD =
  'pe-focus w-full rounded-none border-0 border-b border-ink/25 bg-transparent px-0 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-plum';

type FieldErrors = Partial<Record<'name' | 'email' | 'note' | 'practice_name', string>>;

const STEPS: [string, string][] = [
  ['You tell us how the office runs today', 'Size, roles, what’s currently held together manually.'],
  ['We tell you honestly whether it fits', 'Including if it doesn’t, or if it’s too early for you.'],
  ['We set the office up with you', 'Roles, schedules, policies and the first assignments.'],
];

export default function MarketingStart() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [practice, setPractice] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          name,
          email,
          practice_name: practice,
          role,
          office_size: size,
          note,
          // Honeypot field name must match the edge function exactly.
          company_website: website,
          source: 'start',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        fieldErrors?: FieldErrors;
      };
      if (!res.ok || !data.ok) {
        setFieldErrors(data.fieldErrors ?? {});
        setFormError(data.error ?? 'Something went wrong. Please try again in a moment.');
      } else {
        setDone(true);
      }
    } catch {
      setFormError('We couldn’t reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingLayout>
      {/* ── Masthead ─────────────────────────────────────────── */}
      <section className="border-b-2 border-ink bg-plum text-paper">
        <div className="pe-blueprint-invert relative">
          <Shell className="relative grid gap-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:gap-16 lg:py-12">
            <div>
              <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-paper/55">
                Form 01 · Early access intake
              </p>
              <h1 className="pe-display pe-display-cap mt-4 text-paper">Start Purple Envelope.</h1>
            </div>
            <EnvelopeMark stroke={2} className="ml-auto hidden h-auto w-full max-w-[9rem] text-paper/80 lg:block" />
          </Shell>
        </div>
      </section>

      {/* ── Intake sheet ─────────────────────────────────────── */}
      <section className="border-b-2 border-ink">
        <Shell className="grid gap-0 lg:grid-cols-[0.85fr_1.15fr]">
          {/* left column — the honest framing */}
          <div className="border-ink/15 py-12 lg:border-r lg:py-16 lg:pr-14">
            <p className="max-w-[44ch] text-[1.0625rem] leading-relaxed text-ink">
              You can’t create an office here with a credit card yet. Purple Envelope is opening to a small number of
              independent practices, and each one is set up with us directly.
            </p>
            <ol className="mt-12">
              {STEPS.map(([t, b], i) => (
                <li key={t} className="pe-row grid grid-cols-[3rem_1fr] gap-x-5 py-5 last:border-b last:border-ink/16">
                  <span className="pe-display text-[1.75rem] leading-none text-plum/35">{`0${i + 1}`}</span>
                  <div>
                    <p className="pe-display-tight text-[1.05rem] text-ink">{t}</p>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-10 border-l-2 border-plum pl-5 text-[13.5px] leading-relaxed text-ink-soft">
              Already part of an office that uses Purple Envelope? You don’t need this page —{' '}
              <Link to="/login" className="pe-focus text-plum underline underline-offset-4">
                log in
              </Link>
              .
            </p>
          </div>

          {/* right column — the sheet */}
          <div className="py-12 lg:py-16 lg:pl-14">
            {done ? (
              <div role="status" aria-live="polite" className="border-2 border-ink p-8">
                <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-plum">Received</p>
                <h2 className="pe-display mt-4 text-[1.9rem] text-ink">Thank you — it’s in.</h2>
                <p className="mt-4 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-soft">
                  We read every one of these ourselves. If Purple Envelope isn’t a fit for your office yet, we’ll tell
                  you that plainly rather than leaving you waiting.
                </p>
                <Link
                  to="/features"
                  className="pe-focus mt-7 inline-block border-b-2 border-plum pb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-plum"
                >
                  Keep reading the product tour →
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="border-t-2 border-ink">
                <p className="py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
                  Complete all required lines
                </p>

                {formError && (
                  <p
                    role="alert"
                    className="mb-5 border-l-2 border-destructive bg-destructive/10 p-3 text-[13.5px] text-destructive"
                  >
                    {formError}
                  </p>
                )}

                <div className="grid gap-7 sm:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>Your name *</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      autoComplete="name"
                      aria-invalid={!!fieldErrors.name}
                      className={FIELD}
                    />
                    {fieldErrors.name && <span className="mt-1.5 block text-[12.5px] text-destructive">{fieldErrors.name}</span>}
                  </label>

                  <label className="block">
                    <span className={LABEL}>Email *</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      aria-invalid={!!fieldErrors.email}
                      className={FIELD}
                    />
                    {fieldErrors.email && (
                      <span className="mt-1.5 block text-[12.5px] text-destructive">{fieldErrors.email}</span>
                    )}
                  </label>

                  <label className="block sm:col-span-2">
                    <span className={LABEL}>Practice name</span>
                    <input
                      value={practice}
                      onChange={(e) => setPractice(e.target.value)}
                      autoComplete="organization"
                      className={FIELD}
                    />
                  </label>

                  <label className="block">
                    <span className={LABEL}>Your role</span>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className={FIELD}>
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className={LABEL}>Office size</span>
                    <select value={size} onChange={(e) => setSize(e.target.value)} className={FIELD}>
                      {SIZES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block sm:col-span-2">
                    <span className={LABEL}>How the office runs today</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={5}
                      placeholder="What’s currently held together by one person, a binder, or a group text?"
                      className={`${FIELD} resize-y border border-ink/25 px-3.5 py-3`}
                    />
                    {fieldErrors.note && <span className="mt-1.5 block text-[12.5px] text-destructive">{fieldErrors.note}</span>}
                  </label>
                </div>

                {/* honeypot — visually hidden, never focusable */}
                <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="pe-focus mt-10 inline-flex w-full items-center justify-center gap-2 rounded-none bg-plum px-6 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-plum-deep disabled:opacity-60 sm:w-auto sm:px-12"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send request
                </button>

                <p className="mt-5 max-w-[52ch] font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-ink-soft">
                  Stored only for this conversation. No newsletter, no resale, no patient information.
                </p>
              </form>
            )}
          </div>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
