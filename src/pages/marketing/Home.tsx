import { Link } from 'react-router-dom';
import MarketingLayout, { useTrainingHref } from '@/marketing/MarketingLayout';
import { Reveal, SectionTitle, Shell, Eyebrow, StatusTag } from '@/marketing/primitives';
import RoleSelector, { RoleStoryBlock } from '@/marketing/RoleSelector';
import {
  AttentionQueueVisual,
  AcknowledgmentVisual,
  CloseTheDayVisual,
  KnowledgeVisual,
  TrainingVisual,
} from '@/marketing/ProductVisuals';
import { ArrowRight } from 'lucide-react';

const PROBLEMS = [
  'Too much of the office lives in one person’s head.',
  'Tasks get handed off in the hallway and then evaporate.',
  'The manager spends the day chasing follow-up instead of managing.',
  'There are rules — they’re just hard to find.',
  'A one-off mistake and a repeating pattern look identical.',
];

const MODULES = [
  {
    n: '01',
    title: 'Run the day',
    body: 'The day has a shape, and you can see where it is.',
    items: ['Checklists', 'Close the Day', 'Deposit log', 'Office calendar', 'Time & attendance'],
  },
  {
    n: '02',
    title: 'Keep expectations clear',
    body: 'Delay states separate blocked from ignored, so nobody is treated as late for waiting.',
    items: ['Assignments', 'Acknowledgments', 'Approvals', 'Requests', 'Goals'],
  },
  {
    n: '03',
    title: 'Train the team',
    body: 'Modules, assignments and practice scenarios for the conversations that are actually hard.',
    items: ['Modules', 'Assignments', 'Progress', 'Practice scenarios'],
  },
  {
    n: '04',
    title: 'Keep office knowledge usable',
    body: 'Draft, review, approve, publish, supersede. Published history stays on the record.',
    items: ['Office Handbook', 'Procedures', 'Insurance Desk', 'Versioning'],
  },
  {
    n: '05',
    title: 'Handle office forms better',
    body: 'Front-desk paperwork built as office documents, not another patient database.',
    items: ['Forms & Consents', 'Financial options', 'Broken appointments'],
  },
  {
    n: '06',
    title: 'See what needs attention',
    body: 'Exceptions, bypasses, unread policies and missed follow-up — surfaced, not hunted for.',
    items: ['Owner dashboard', 'Notifications', 'Approvals', 'Exception signals'],
  },
];

export default function MarketingHome() {
  const trainingHref = useTrainingHref();

  return (
    <MarketingLayout>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden border-b-2 border-ink/85">
        <div className="pe-grid pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <Shell className="relative grid gap-0 [&>*]:min-w-0 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="border-line py-14 pr-0 md:py-20 lg:border-r lg:pr-14">
            <div className="flex items-center gap-3">
              <span className="h-px w-8 bg-plum" aria-hidden />
              <Eyebrow>Practice operations · independent dental</Eyebrow>
            </div>
            <h1 className="mt-7 font-display text-[clamp(2.6rem,6.4vw,4.5rem)] font-medium leading-[0.94] tracking-[-0.03em] text-ink">
              Run the office.
              <span className="mt-1 block border-b-2 border-plum pb-3 text-plum">
                Without living at the office.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-ink-soft sm:text-[1.125rem]">
              Practice-operations software for independent dental offices. Daily workflows, training, office
              knowledge, forms, requests and accountability in one place instead of in one person’s memory.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/start"
                className="group inline-flex min-h-[48px] items-center gap-2 border border-plum bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep"
              >
                Start Purple Envelope
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#what-it-does"
                className="inline-flex min-h-[48px] items-center border border-ink/25 px-6 py-3.5 text-[14.5px] font-medium text-ink transition-colors hover:border-plum hover:text-plum"
              >
                See how it works
              </a>
              <Link
                to="/login"
                className="inline-flex min-h-[48px] items-center px-2 text-[14.5px] text-ink-soft underline-offset-4 hover:text-plum hover:underline"
              >
                Log in
              </Link>
            </div>
            <p className="mt-10 border-t border-line pt-5 font-display text-[15px] text-plum">
              Only your business, never your patients.
            </p>
          </div>

          <div className="relative border-t border-line py-12 lg:border-t-0 lg:py-20 lg:pl-14">
            <div className="pe-ruled pointer-events-none absolute inset-y-0 right-0 hidden w-full opacity-70 lg:block" aria-hidden />
            <div className="relative">
              <AttentionQueueVisual className="pe-offset" />
              <CloseTheDayVisual className="mt-6 hidden max-w-[20rem] sm:block lg:-ml-16 lg:w-[19rem]" />
            </div>
          </div>
        </Shell>
      </section>

      {/* ---------------- ROLE SELECTOR ---------------- */}
      <section className="border-b border-line bg-paper-2/60">
        <Shell className="py-16">
          <Reveal>
            <RoleSelector />
          </Reveal>
          <Reveal className="mt-12" delay={60}>
            <RoleStoryBlock />
          </Reveal>
          <p className="mt-8 border-t border-line pt-4 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
            This only changes what you read here. Real permissions come from your Purple Envelope account.
          </p>
        </Shell>
      </section>

      {/* ---------------- THE PROBLEM ---------------- */}
      <section className="border-b border-line">
        <Shell className="grid gap-12 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal>
            <SectionTitle
              eyebrow="The problem"
              title={<>An office can be run well and still be held together by memory.</>}
              lede="None of this means anyone is doing a bad job. It means the office runs on people instead of systems — and people go home, get sick, and eventually leave."
            />
          </Reveal>
          <Reveal delay={80}>
            <ul className="border-t border-ink/80">
              {PROBLEMS.map((p, i) => (
                <li key={p} className="flex gap-6 border-b border-line py-5">
                  <span className="font-mono text-[11px] leading-6 text-plum/60">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[15px] leading-relaxed text-ink">{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </Shell>
      </section>

      {/* ---------------- WHAT IT DOES ---------------- */}
      <section id="what-it-does" className="scroll-mt-20 border-b border-line bg-paper-2/60">
        <Shell className="py-20">
          <Reveal>
            <SectionTitle
              eyebrow="What Purple Envelope does"
              title="Six jobs, not thirty features."
              lede="Every part of the product exists because something in a real office kept falling through."
            />
          </Reveal>

          <div className="mt-14 grid gap-px border border-ink/80 bg-line sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <Reveal key={m.n} delay={i * 50} className="bg-paper">
                <div className="flex h-full flex-col p-7">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-plum/70">{m.n}</span>
                  <h3 className="mt-3 font-display text-[1.35rem] font-medium leading-snug text-ink">{m.title}</h3>
                  <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink-soft">{m.body}</p>
                  <ul className="mt-6 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line pt-4">
                    {m.items.map((it) => (
                      <li key={it} className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            <Reveal>
              <AcknowledgmentVisual />
            </Reveal>
            <Reveal delay={60}>
              <KnowledgeVisual />
            </Reveal>
            <Reveal delay={120}>
              <TrainingVisual />
            </Reveal>
          </div>

          <div className="mt-10 border-t border-line pt-6">
            <Link
              to="/features"
              className="group inline-flex items-center gap-2 text-[14.5px] font-medium text-plum underline-offset-4 hover:underline"
            >
              See the full product tour
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </Shell>
      </section>

      {/* ---------------- BUILT FOR DENTAL ---------------- */}
      <section className="border-b border-line bg-plum-deep text-paper">
        <div className="pe-grid-dark pointer-events-none absolute inset-0 hidden" aria-hidden />
        <Shell className="grid gap-12 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal>
            <Eyebrow className="text-paper/50">Built for dental</Eyebrow>
            <h2 className="mt-5 font-display text-[clamp(1.9rem,4vw,2.9rem)] font-medium leading-[1.05] tracking-[-0.02em]">
              Not generic HR software with a tooth icon on it.
            </h2>
            <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-paper/70">
              A dental office isn’t a generic small business. It runs on a schedule that collapses at 2pm, insurance
              quirks nobody wrote down, and roles that overlap all day.
            </p>
            <Link
              to="/for-dental"
              className="mt-8 inline-flex items-center gap-2 border-b border-paper/40 pb-1 text-[14.5px] text-paper transition-colors hover:border-paper"
            >
              Why dental specifically
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal delay={80}>
            <ul className="grid gap-px bg-paper/15 sm:grid-cols-2">
              {[
                ['Owner / dentist', 'Chairside all day. Needs the exceptions, not the noise.'],
                ['Office manager', 'Runs the operation. Should not have to be the operation.'],
                ['Front desk', 'Schedule, insurance, collections, phones — often at once.'],
                ['Hygiene', 'Own column, own rhythm, own recall responsibilities.'],
                ['Assisting', 'Sterilization, turnover, setup, inventory.'],
                ['Associate providers', 'Same office rules, different chair.'],
              ].map(([role, note]) => (
                <li key={role} className="bg-plum-deep p-5">
                  <p className="font-display text-[1.05rem]">{role}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-paper/60">{note}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </Shell>
      </section>

      {/* ---------------- INDEPENDENCE + PRIVACY ---------------- */}
      <section className="border-b border-line">
        <Shell className="grid gap-0 py-0 lg:grid-cols-2">
          <Reveal className="border-line py-16 lg:border-r lg:pr-16">
            <Eyebrow>Why it exists</Eyebrow>
            <p className="mt-6 font-display text-[clamp(1.5rem,3vw,2.15rem)] font-medium leading-[1.12] tracking-[-0.015em] text-ink">
              “You shouldn’t need thirty locations to run a tight ship.”
            </p>
            <p className="mt-6 text-[14.5px] leading-relaxed text-ink-soft">
              Purple Envelope is being built inside a working independent practice, in response to what actually
              breaks: the procedure only one person knows, the policy everyone “was told” about, the request that went
              out in a text and never came back.
            </p>
            <Link
              to="/about"
              className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-plum underline-offset-4 hover:underline"
            >
              How it started
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Reveal>

          <Reveal delay={70} className="border-t border-line py-16 lg:border-t-0 lg:pl-16">
            <Eyebrow>Privacy posture</Eyebrow>
            <p className="mt-6 font-display text-[clamp(1.5rem,3vw,2.15rem)] font-medium leading-[1.12] tracking-[-0.015em] text-ink">
              Only your business,
              <span className="block text-plum">never your patients.</span>
            </p>
            <p className="mt-6 text-[14.5px] leading-relaxed text-ink-soft">
              Purple Envelope is deliberately the business side of the practice. It is not a patient-record system and
              does not replace your practice management software. We describe how access actually works instead of
              posting compliance logos.
            </p>
            <Link
              to="/security"
              className="mt-6 inline-flex items-center gap-2 text-[14px] font-medium text-plum underline-offset-4 hover:underline"
            >
              Read the security page
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Reveal>
        </Shell>
      </section>

      {/* ---------------- TRAINING ---------------- */}
      <section className="border-b border-line bg-paper-2/60">
        <Shell className="py-14">
          <Reveal className="flex flex-col items-start justify-between gap-6 border-l-2 border-plum bg-paper p-7 md:flex-row md:items-center md:p-9">
            <div>
              <Eyebrow>Already using Purple Envelope?</Eyebrow>
              <h2 className="mt-3 font-display text-[1.5rem] font-medium leading-snug text-ink">
                Training uses the same account you already use at work.
              </h2>
              <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-soft">
                No separate login, no second system. If you’re signed in, this takes you straight there.
              </p>
            </div>
            <Link
              to={trainingHref}
              className="group inline-flex min-h-[48px] shrink-0 items-center gap-2 border border-plum bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep"
            >
              Open Training
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </Shell>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="relative overflow-hidden bg-plum-deep text-paper">
        <div className="pe-grid-dark pointer-events-none absolute inset-0" aria-hidden />
        <Shell className="relative py-20">
          <Reveal className="max-w-3xl">
            <h2 className="font-display text-[clamp(2rem,4.6vw,3.25rem)] font-medium leading-[1.03] tracking-[-0.02em]">
              Give the office a system, so it stops being a person.
            </h2>
            <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-paper/70">
              Purple Envelope is in active development inside a live practice and opening to a small number of
              independent offices.
              <StatusTag>Early access</StatusTag>
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to="/start"
                className="inline-flex min-h-[48px] items-center bg-paper px-7 py-3.5 text-[14.5px] font-medium text-plum-deep transition-colors hover:bg-white"
              >
                Join early access
              </Link>
              <Link
                to="/features"
                className="inline-flex min-h-[48px] items-center border border-paper/35 px-7 py-3.5 text-[14.5px] font-medium text-paper transition-colors hover:bg-paper/10"
              >
                Explore Purple Envelope
              </Link>
            </div>
          </Reveal>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
