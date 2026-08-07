import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, SectionTitle, Shell, Eyebrow, StatusTag } from '@/marketing/primitives';
import { ArrowRight } from 'lucide-react';

/**
 * Pricing page.
 *
 * Purple Envelope has no published price list yet and no approved commercial
 * commitments. This page states the principles we are designing pricing around
 * and nothing that would bind the business — no per-person figures, no
 * feature-paywall promises, no "locked in forever" language.
 */

const PRINCIPLES = [
  {
    n: '01',
    title: 'Priced for an independent office',
    body:
      'The comparison isn’t enterprise software. It’s the hours a manager currently spends chasing follow-up, and the cost of the thing that got missed.',
  },
  {
    n: '02',
    title: 'Readable, not a matrix',
    body:
      'You should be able to explain what you’re paying for in one sentence, without a spreadsheet or a call with a sales engineer.',
  },
  {
    n: '03',
    title: 'No surprise invoices',
    body:
      'Whatever the final structure is, changes will be told to you plainly and in advance. We are not building a product that quietly grows its own bill.',
  },
  {
    n: '04',
    title: 'The team is not an upsell',
    body:
      'Accountability only works if everyone in the office is actually in the system. Pricing has to reflect that, not punish it.',
  },
];

export default function MarketingPricing() {
  return (
    <MarketingLayout>
      <section className="border-b-2 border-ink/85">
        <Shell className="grid gap-12 py-16 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <Reveal>
            <span className="h-px w-10 bg-plum" aria-hidden />
            <Eyebrow className="mt-5">Pricing</Eyebrow>
            <h1 className="mt-4 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-medium leading-[1.03] tracking-[-0.025em] text-ink">
              We haven’t set the price yet.
              <span className="mt-2 block text-plum">So we’re not going to invent one.</span>
            </h1>
            <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-ink-soft">
              Purple Envelope is in early access with a small number of independent practices. Standard pricing is
              still being worked out, and posting a number we might change would be the first dishonest thing on this
              site.
              <StatusTag>Early access</StatusTag>
            </p>
            <p className="mt-5 max-w-lg text-[14.5px] leading-relaxed text-ink-soft">
              If you talk to us about early access, you’ll get the actual terms for your office in writing before
              anything starts. No obligation, and no commitment on this page pretending to be one.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                to="/start"
                className="group inline-flex min-h-[48px] items-center gap-2 border border-plum bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep"
              >
                Ask about early access
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/features"
                className="inline-flex min-h-[48px] items-center border border-ink/25 px-6 py-3.5 text-[14.5px] font-medium text-ink transition-colors hover:border-plum hover:text-plum"
              >
                See what you’d be paying for
              </Link>
            </div>
          </Reveal>

          <Reveal delay={70}>
            <div className="border border-ink/80 bg-white p-8 pe-offset">
              <Eyebrow>What early access means today</Eyebrow>
              <ul className="mt-6 border-t border-line">
                {[
                  ['Set up with us', 'We configure the office with you rather than handing you an empty account.'],
                  ['Direct line', 'You talk to the people building it, and what you report changes the product.'],
                  ['Terms in writing', 'Whatever is agreed for your office is written down before you start.'],
                  ['You can leave', 'Your office data is yours; we are not building a hostage situation.'],
                ].map(([t, b]) => (
                  <li key={t} className="border-b border-line py-4">
                    <p className="text-[14px] font-medium text-ink">{t}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{b}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-6 font-mono text-[10.5px] uppercase leading-relaxed tracking-[0.12em] text-ink-soft">
                Nothing on this page is a price quote or a contract.
              </p>
            </div>
          </Reveal>
        </Shell>
      </section>

      <section className="border-b border-line bg-paper-2/60">
        <Shell className="py-20">
          <Reveal>
            <SectionTitle
              eyebrow="How we’re thinking about it"
              title="The principles the price has to satisfy."
              lede="These are commitments about how we’ll behave, not numbers we can’t honour yet."
            />
          </Reveal>
          <div className="mt-12 grid gap-px border border-ink/80 bg-line sm:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.n} delay={i * 50} className="bg-paper">
                <div className="h-full p-7">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-plum/70">{p.n}</span>
                  <h3 className="mt-3 font-display text-[1.25rem] font-medium leading-snug text-ink">{p.title}</h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      <section className="relative overflow-hidden bg-plum-deep text-paper">
        <div className="pe-grid-dark pointer-events-none absolute inset-0" aria-hidden />
        <Shell className="relative py-18 md:py-20">
          <Reveal className="max-w-2xl">
            <h2 className="font-display text-[clamp(1.8rem,4vw,2.7rem)] font-medium leading-[1.05] tracking-[-0.02em]">
              Tell us about the office and we’ll tell you where it stands.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-paper/70">
              Including whether it’s too early for you. That answer is free and we give it often.
            </p>
            <Link
              to="/start"
              className="group mt-8 inline-flex min-h-[48px] items-center gap-2 bg-paper px-7 py-3.5 text-[14.5px] font-medium text-plum-deep transition-colors hover:bg-white"
            >
              Start the conversation
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
