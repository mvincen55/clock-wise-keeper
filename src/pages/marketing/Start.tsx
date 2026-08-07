import { useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, Shell, Eyebrow } from '@/marketing/primitives';
import { ArrowRight } from 'lucide-react';

/**
 * Early-access / contact entry point.
 *
 * Self-service office creation is not open, so this page does not pretend to
 * create an account. It composes a message to the Purple Envelope inbox using
 * the visitor's own mail client — no lead database, no fake "you're signed up"
 * confirmation. Change CONTACT_EMAIL if the inbox address changes.
 */
const CONTACT_EMAIL = 'hello@purpleenvelope.app';

const SIZES = ['1 doctor', '2 doctors', '3+ doctors'];
const ROLES = ['Owner / dentist', 'Office manager', 'Team member', 'Something else'];

export default function MarketingStart() {
  const [name, setName] = useState('');
  const [practice, setPractice] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [note, setNote] = useState('');

  const body = [
    `Name: ${name}`,
    `Practice: ${practice}`,
    `Role: ${role}`,
    `Size: ${size}`,
    '',
    'How the office runs today:',
    note,
  ].join('\n');

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    'Purple Envelope — early access',
  )}&body=${encodeURIComponent(body)}`;

  return (
    <MarketingLayout>
      <section className="border-b border-line">
        <Shell className="grid gap-14 py-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20 lg:py-20">
          <Reveal>
            <Eyebrow>Early access</Eyebrow>
            <h1 className="mt-5 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-medium leading-[1.03] tracking-[-0.025em] text-ink">
              Start Purple Envelope.
            </h1>
            <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-ink-soft">
              We’re being deliberately straight about this: you can’t create an office here with a credit card yet.
              Purple Envelope is opening to a small number of independent practices, and each one is set up with us
              directly so the office’s policies, schedules and configuration land correctly on day one.
            </p>
            <ol className="mt-9 space-y-5 border-l border-line pl-6">
              {[
                ['You tell us how the office runs today', 'Size, roles, what’s currently held together manually.'],
                ['We tell you honestly whether it fits', 'Including if it doesn’t, or if it’s too early for you.'],
                ['We set the office up with you', 'Roles, schedules, policies and the first assignments.'],
              ].map(([t, b], i) => (
                <li key={t} className="relative">
                  <span className="absolute -left-[31px] grid h-5 w-5 place-items-center rounded-full border border-line bg-paper font-mono text-[10px] text-plum">
                    {i + 1}
                  </span>
                  <p className="text-[14.5px] font-medium text-ink">{t}</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">{b}</p>
                </li>
              ))}
            </ol>
            <p className="mt-9 rounded-xl border border-line bg-paper-2/70 p-5 text-[13.5px] leading-relaxed text-ink-soft">
              Already part of an office that uses Purple Envelope? You don’t need this page —{' '}
              <Link to="/login" className="text-plum underline underline-offset-4">
                log in
              </Link>{' '}
              with the account you already use at work. Joining an office is by invitation from your owner or manager.
            </p>
          </Reveal>

          <Reveal delay={70}>
            <form
              className="rounded-2xl border border-line bg-white p-7 md:p-8"
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = mailto;
              }}
            >
              <h2 className="font-display text-[1.35rem] font-medium text-ink">Tell us about your office</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                This opens a message in your own email app addressed to us. Nothing is stored on this page.
              </p>

              <div className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Your name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-plum"
                    placeholder="First and last"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Practice name</span>
                  <input
                    value={practice}
                    onChange={(e) => setPractice(e.target.value)}
                    className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-plum"
                    placeholder="Your office"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Your role</span>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-plum"
                    >
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-ink">Office size</span>
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none focus:border-plum"
                    >
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
                    className="w-full resize-y rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[14px] text-ink outline-none transition-colors focus:border-plum"
                    placeholder="Training, PTO, closing routine, insurance notes…"
                  />
                </label>
              </div>

              <button
                type="submit"
                className="group mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep"
              >
                Compose the message
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <p className="mt-3 text-center text-[12px] text-ink-soft">
                Or email us directly at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-plum underline underline-offset-4">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </form>
          </Reveal>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
