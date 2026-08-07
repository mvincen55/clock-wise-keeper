import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, Shell, Eyebrow, SectionTitle } from '@/marketing/primitives';
import { Check } from 'lucide-react';

const PRINCIPLES = [
  {
    title: 'One price for the office',
    body:
      'Not a per-feature maze. An independent practice shouldn’t need a procurement process to figure out what it owes.',
  },
  {
    title: 'Priced for one office, built to grow slightly',
    body:
      'A single location is the normal case. A small owner-led group with two or three locations is a shape we’ve kept room for in the design, not a different product tier we’ll upsell you into.',
  },
  {
    title: 'No paywalling the parts that make it work',
    body:
      'Accountability, knowledge and training only work if the whole team is in the system. Charging per person for the people who most need access defeats the point.',
  },
  {
    title: 'You can leave with your data',
    body:
      'Timesheets, goals and operational reports export. Your office’s records are your office’s records.',
  },
];

export default function MarketingPricing() {
  return (
    <MarketingLayout>
      <section className="border-b border-line">
        <Shell className="py-16 md:py-20">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.25rem,5.4vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em] text-ink">
            Launch pricing is being finalized.
          </h1>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
            We’d rather publish nothing than publish a number we’ll change in a month. Purple Envelope is in active
            development inside a working practice and is opening to a small group of early offices. What we can tell
            you now is how we intend to price it.
          </p>
        </Shell>
      </section>

      <section className="border-b border-line bg-paper-2/50">
        <Shell className="py-16">
          <Reveal>
            <SectionTitle eyebrow="Pricing philosophy" title="Four commitments we’re willing to put in writing." />
          </Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} delay={i * 50} className="bg-paper">
                <div className="h-full p-7">
                  <h3 className="font-display text-[1.2rem] font-medium text-ink">{p.title}</h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      <section className="border-b border-line">
        <Shell className="py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:gap-16">
            <Reveal>
              <div className="rounded-2xl border border-plum/25 bg-white p-8 md:p-10">
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-[1.6rem] font-medium text-ink">Early access</h2>
                  <span className="rounded-full border border-line bg-paper-2 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                    Open now
                  </span>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
                  For independent offices willing to use software that is still being built, and to tell us when it’s
                  wrong. Pricing for early offices is agreed directly and in writing before anything starts.
                </p>
                <ul className="mt-7 space-y-3">
                  {[
                    'Full access to the shipped product, not a limited demo',
                    'Direct line to the people building it',
                    'Your operational reality shapes what gets built next',
                    'Clear, written terms before you commit to anything',
                  ].map((i) => (
                    <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-plum" />
                      {i}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/start"
                  className="mt-8 inline-block rounded-full bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep"
                >
                  Join early access
                </Link>
              </div>
            </Reveal>

            <Reveal delay={70}>
              <div className="rounded-2xl border border-line bg-paper-2/60 p-8">
                <h2 className="font-display text-[1.35rem] font-medium text-ink">General availability</h2>
                <span className="mt-3 inline-block rounded-full border border-line bg-white px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
                  Pricing to be published
                </span>
                <p className="mt-4 text-[14.5px] leading-relaxed text-ink-soft">
                  When standard pricing is set, it will be published on this page in full — the number, what’s
                  included, and what isn’t.
                </p>
                <p className="mt-4 text-[14.5px] leading-relaxed text-ink-soft">
                  No “contact sales for a quote” theater, no hidden enterprise tier, and no crossed-out prices that
                  were never real.
                </p>
              </div>
            </Reveal>
          </div>
        </Shell>
      </section>

      <section className="bg-plum-deep text-paper">
        <Shell className="py-16 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.7rem,3.8vw,2.6rem)] font-medium leading-[1.07]">
            Ask us what it would cost for your office.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] text-paper/70">
            We’ll give you a straight answer, including if it isn’t the right time for you yet.
          </p>
          <Link
            to="/start"
            className="mt-8 inline-block rounded-full bg-paper px-7 py-3.5 text-[14.5px] font-medium text-plum-deep transition-transform hover:-translate-y-0.5"
          >
            Talk to us
          </Link>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
