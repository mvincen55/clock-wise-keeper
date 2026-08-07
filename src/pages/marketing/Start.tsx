import { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, Shell, Eyebrow } from '@/marketing/primitives';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Check, Loader2 } from 'lucide-react';

/**
 * Early-access inquiry.
 *
 * Self-service office creation is not open, so this does not pretend to create
 * an account. The form posts to the `submit-lead` edge function, which stores
 * the inquiry in the isolated `marketing_leads` table (service-role only, never
 * readable by the site) and notifies the team. No third-party CRM or tracker.
 */
const CONTACT_EMAIL = 'hello@purpleenvelope.app';

const SIZES = ['1 doctor', '2 doctors', '3+ doctors'];
const ROLES = ['Owner / dentist', 'Office manager', 'Team member', 'Something else'];

type FieldErrors = Partial<Record<'name' | 'email', string>>;

export default function MarketingStart() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [practice, setPractice] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const field =
    'w-full border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-plum';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setFieldErrors({});

    try {
      const { data, error } = await supabase.functions.invoke('submit-lead', {
        body: {
          name,
          email,
          practice_name: practice,
          role,
          office_size: size,
          note,
          company_website: website,
        },
      });

      const payload = (data ?? {}) as { ok?: boolean; error?: string; fieldErrors?: FieldErrors };

      if (payload.ok) {
        setSent(true);
        return;
      }

      if (payload.fieldErrors) setFieldErrors(payload.fieldErrors);
      setFormError(
        payload.error ??
          (error
            ? 'Something went wrong sending that. Please try again, or email us directly.'
            : 'Something went wrong. Please try again.'),
      );
    } catch {
      setFormError('Something went wrong sending that. Please try again, or email us directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingLayout>
      <section className="border-b border-line">
        <Shell className="grid gap-14 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20 lg:py-20">
          <Reveal>
            <span className="h-px w-10 bg-plum" aria-hidden />
            <Eyebrow className="mt-5">Early access</Eyebrow>
            <h1 className="mt-4 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-medium leading-[1.03] tracking-[-0.025em] text-ink">
              Start Purple Envelope.
            </h1>
            <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-ink-soft">
              You can’t create an office here with a credit card yet. Purple Envelope is opening to a small number of
              independent practices, and each one is set up with us directly so policies, schedules and configuration
              land correctly on day one.
            </p>
            <ol className="mt-9 space-y-5 border-l border-line pl-6">
              {[
                ['You tell us how the office runs today', 'Size, roles, what’s currently held together manually.'],
                ['We tell you honestly whether it fits', 'Including if it doesn’t, or if it’s too early for you.'],
                ['We set the office up with you', 'Roles, schedules, policies and the first assignments.'],
              ].map(([t, b], i) => (
                <li key={t} className="relative">
                  <span className="absolute -left-[31px] grid h-5 w-5 place-items-center border border-line bg-paper font-mono text-[10px] text-plum">
                    {i + 1}
                  </span>
                  <p className="text-[14.5px] font-medium text-ink">{t}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{b}</p>
                </li>
              ))}
            </ol>
            <p className="mt-9 border-l-2 border-plum bg-paper-2/70 p-5 text-[13.5px] leading-relaxed text-ink-soft">
              Already part of an office that uses Purple Envelope? You don’t need this page —{' '}
              <Link to="/login" className="text-plum underline underline-offset-4">
                log in
              </Link>{' '}
              with the account you already use at work. Joining an office is by invitation from your owner or manager.
            </p>
          </Reveal>

          <Reveal delay={70}>
            {sent ? (
              <div className="border border-ink/80 bg-white p-8 pe-offset">
                <div className="grid h-10 w-10 place-items-center border border-plum bg-plum text-white">
                  <Check className="h-5 w-5" />
                </div>
                <h2 className="mt-5 font-display text-[1.5rem] font-medium text-ink">Message received.</h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
                  Thanks — we have your note and we’ll reply to <span className="text-ink">{email}</span> personally.
                  We’re a small team inside a working practice, so it may not be instant, but it will be a real answer
                  from a real person.
                </p>
                <p className="mt-4 text-[13px] text-ink-soft">
                  Need to add something? Email{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-plum underline underline-offset-4">
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
              </div>
            ) : (
              <form className="border border-ink/80 bg-white p-7 pe-offset md:p-8" onSubmit={handleSubmit}>
                <h2 className="font-display text-[1.35rem] font-medium text-ink">Tell us about your office</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                  This goes straight to us. We store your note so we can reply — nothing else, and no third-party
                  marketing tools.
                </p>

                <div className="mt-6 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Your name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={field}
                      placeholder="First and last"
                      required
                    />
                    {fieldErrors.name && <span className="mt-1 block text-[12px] text-destructive">{fieldErrors.name}</span>}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={field}
                      placeholder="you@yourpractice.com"
                      required
                    />
                    {fieldErrors.email && (
                      <span className="mt-1 block text-[12px] text-destructive">{fieldErrors.email}</span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Practice name</span>
                    <input
                      value={practice}
                      onChange={(e) => setPractice(e.target.value)}
                      className={field}
                      placeholder="Your office"
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Your role</span>
                      <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
                        {ROLES.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Office size</span>
                      <select value={size} onChange={(e) => setSize(e.target.value)} className={field}>
                        {SIZES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-ink">
                      What’s currently held together manually?
                    </span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                      className={`${field} resize-y`}
                      placeholder="Training, PTO, closing routine, insurance notes…"
                    />
                  </label>
                </div>

                {/* Honeypot — hidden from people, tempting to bots. */}
                <div aria-hidden className="hidden">
                  <label>
                    Company website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </label>
                </div>

                {formError && (
                  <p className="mt-5 border-l-2 border-destructive bg-destructive/10 p-3 text-[13px] text-destructive">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="group mt-6 inline-flex min-h-[50px] w-full items-center justify-center gap-2 border border-plum bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Send it to us
                  {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
                </button>
                <p className="mt-3 text-center text-[12px] text-ink-soft">
                  Or email us directly at{' '}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="text-plum underline underline-offset-4">
                    {CONTACT_EMAIL}
                  </a>
                </p>
              </form>
            )}
          </Reveal>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
