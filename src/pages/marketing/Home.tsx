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
  'Training depends entirely on who happened to explain it.',
  'There are rules — they’re just hard to find.',
  'The owner hears about a problem three weeks after it started.',
  'A one-off mistake and a repeating pattern look identical.',
  'Requests disappear into texts, messages and memory.',
];

const MODULES = [
  {
    n: '01',
    title: 'Run the day',
    body:
      'Opening and closing checklists, Close the Day, the deposit log, the office calendar, time and attendance. The day has a shape, and you can see where it is.',
    items: ['Checklists', 'Close the Day', 'Deposit log', 'Office calendar', 'Time & attendance'],
  },
  {
    n: '02',
    title: 'Keep expectations clear',
    body:
      'Assignments, acknowledgments of an exact published version, approvals, requests, goals and follow-through. Delay states distinguish blocked from ignored, so nobody gets treated as late for waiting on someone else.',
    items: ['Assignments', 'Acknowledgments', 'Approval queue', 'Requests', 'Goals'],
  },
  {
    n: '03',
    title: 'Train the team',
    body:
      'Training modules with assignments and progress, including practice scenarios for the conversations that are actually hard — the late-cancellation call, the treatment estimate.',
    items: ['Modules', 'Assignments', 'Progress', 'Practice scenarios'],
  },
  {
    n: '04',
    title: 'Keep office knowledge usable',
    body:
      'The Office Handbook, procedures and the Insurance Desk, under a governed publish flow: draft, review, approve, publish, supersede. Published history is immutable.',
    items: ['Office Handbook', 'Procedures', 'Insurance Desk', 'Versioning'],
  },
  {
    n: '05',
    title: 'Handle office forms better',
    body:
      'Forms & Consents and the treatment/financial workflows the front desk runs all day, built as office documents rather than another patient database.',
    items: ['Forms & Consents', 'Financial options', 'Broken appointments'],
  },
  {
    n: '06',
    title: 'See what needs attention',
    body:
      'Owner and manager views, notifications, approval queues and the operational signals that are actually recorded — bypasses, exceptions, unread policies, missed follow-up.',
    items: ['Owner dashboard', 'Notifications', 'Approvals', 'Exception signals'],
  },
];

export default function MarketingHome() {
  const trainingHref = useTrainingHref();

  return (
    <MarketingLayout>
      {/* ---------------- HERO ---------------- */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="pe-grain pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <Shell className="relative grid gap-14 pb-16 pt-14 [&>*]:min-w-0 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pb-24">
          <div>
            <Eyebrow>Practice operations · independent dental</Eyebrow>
            <h1 className="mt-5 font-display text-[clamp(2.5rem,6.2vw,4.25rem)] font-medium leading-[0.98] tracking-[-0.025em] text-ink">
              Run the office.
              <span className="block text-plum">Without living at the office.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink-soft sm:text-[1.125rem]">
              Purple Envelope is practice-operations software for independent dental offices. Daily workflows,
              training, office knowledge, forms, requests, accountability and management visibility live in one
              place instead of in one person’s memory.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#what-it-does"
                className="group inline-flex items-center gap-2 rounded-full bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep"
              >
                See how it works
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <Link
                to="/start"
                className="rounded-full border border-line bg-white/70 px-6 py-3.5 text-[14.5px] font-medium text-ink transition-colors hover:border-plum/40 hover:text-plum"
              >
                Start Purple Envelope
              </Link>
              <Link to="/login" className="px-2 text-[14.5px] text-ink-soft underline-offset-4 hover:text-plum hover:underline">
                Log in
              </Link>
            </div>
            <p className="mt-7 font-display text-[15px] text-plum">Only your business, never your patients.</p>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-plum-tint via-paper to-paper-2"
            />
            <AttentionQueueVisual className="lg:translate-y-2" />
            <CloseTheDayVisual className="mt-5 hidden max-w-[20rem] sm:block lg:-ml-20 lg:w-[19rem]" />
          </div>
        </Shell>
      </section>

      {/* ---------------- ROLE SELECTOR ---------------- */}
      <section className="border-b border-line bg-paper-2/50 lg:pt-28">
        <Shell className="py-16">
          <Reveal>
            <RoleSelector />
          </Reveal>
          <Reveal className="mt-12" delay={60}>
            <RoleStoryBlock />
          </Reveal>
          <p className="mt-8 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-soft">
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
              lede="None of this means anyone is doing a bad job. It means the office is running on people instead of on systems — and people go home, get sick, and eventually leave."
            />
          </Reveal>
          <Reveal delay={80}>
            <ul className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
              {PROBLEMS.map((p, i) => (
                <li key={p} className="flex gap-4 border-b border-line py-4 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
                  <span className="font-mono text-[11px] text-plum/50">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[14.5px] leading-relaxed text-ink">{p}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </Shell>
      </section>

      {/* ---------------- WHAT IT DOES ---------------- */}
      <section id="what-it-does" className="scroll-mt-20 border-b border-line bg-paper-2/50">
        <Shell className="py-20">
          <Reveal>
            <SectionTitle
              eyebrow="What Purple Envelope does"
              title="Six jobs, not thirty features."
              lede="Every part of the product exists because something in a real office kept falling through."
            />
          </Reveal>

          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((m, i) => (
              <Reveal key={m.n} delay={i * 50} className="bg-paper">
                <div className="flex h-full flex-col p-7">
                  <span className="font-mono text-[11px] tracking-[0.14em] text-plum/60">{m.n}</span>
                  <h3 className="mt-3 font-display text-[1.35rem] font-medium leading-snug text-ink">{m.title}</h3>
                  <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-ink-soft">{m.body}</p>
                  <ul className="mt-5 flex flex-wrap gap-1.5">
                    {m.items.map((it) => (
                      <li
                        key={it}
                        className="rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] text-ink-soft"
                      >
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
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

          <div className="mt-8 text-center">
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
        <Shell className="py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <Reveal>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/50">Built for dental</p>
              <h2 className="mt-5 font-display text-[clamp(1.9rem,4vw,3rem)] font-medium leading-[1.05] tracking-[-0.02em]">
                Not generic HR software with a tooth icon on it.
              </h2>
              <p className="mt-6 max-w-lg text-[1.0625rem] leading-relaxed text-paper/70">
                Purple Envelope assumes the structure of an independent dental office: an owner who is chairside most
                of the day, a manager holding the operational load, and a small team that switches between clinical
                and front-office work constantly.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <ul className="grid gap-px overflow-hidden rounded-xl bg-paper/15 sm:grid-cols-2">
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
          </div>
        </Shell>
      </section>

      {/* ---------------- WHY / INDEPENDENCE ---------------- */}
      <section className="border-b border-line">
        <Shell className="grid gap-14 py-20 lg:grid-cols-2 lg:gap-24">
          <Reveal>
            <SectionTitle
              eyebrow="Why it exists"
              title="It came out of an office, not a whiteboard."
            />
            <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-soft">
              <p>
                Purple Envelope is being built inside a working independent dental practice, in response to the
                things that actually break: the procedure only one person knows, the policy everyone “was told” about,
                the request that went out in a text and never came back.
              </p>
              <p>
                That includes the small unwritten rules — who calls the lab, what happens when the schedule collapses
                at 2pm, which insurance quirk bites twice a month. Those are the details that make an office run, and
                they’re exactly the details that disappear when someone leaves.
              </p>
            </div>
          </Reveal>
          <Reveal delay={80} className="flex">
            <div className="relative flex w-full flex-col justify-center rounded-2xl border border-line bg-paper-2/70 p-9">
              <p className="font-display text-[clamp(1.5rem,3vw,2.15rem)] font-medium leading-[1.15] tracking-[-0.015em] text-ink">
                “You shouldn’t need thirty locations to run a tight ship.”
              </p>
              <p className="mt-5 text-[14.5px] leading-relaxed text-ink-soft">
                Groups buy operational discipline as software. Independent offices usually get a binder and a good
                manager. Purple Envelope is for the independents — one office today, with room in the design for a
                small owner-led group later.
              </p>
            </div>
          </Reveal>
        </Shell>
      </section>

      {/* ---------------- PRIVACY ---------------- */}
      <section className="border-b border-line bg-paper-2/50">
        <Shell className="py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-20">
            <Reveal>
              <Eyebrow>Privacy posture</Eyebrow>
              <p className="mt-5 font-display text-[clamp(1.9rem,4.2vw,3rem)] font-medium leading-[1.05] tracking-[-0.02em] text-ink">
                Only your business,
                <span className="block text-plum">never your patients.</span>
              </p>
            </Reveal>
            <Reveal delay={80}>
              <div className="space-y-4 text-[15px] leading-relaxed text-ink-soft">
                <p>
                  Purple Envelope is deliberately the business side of the practice. It is not a patient-record system
                  and does not replace your practice management software.
                </p>
                <p>
                  Private coaching and training conversations are not browsable by owners or managers. The product is
                  built for accountability, not surveillance — and accountability applies to owners and managers too.
                </p>
                <p>
                  We describe how access actually works instead of posting compliance logos.{' '}
                  <Link to="/security" className="text-plum underline underline-offset-4">
                    Read the security page
                  </Link>
                  .
                </p>
              </div>
            </Reveal>
          </div>
        </Shell>
      </section>

      {/* ---------------- TRAINING ---------------- */}
      <section className="border-b border-line">
        <Shell className="py-16">
          <Reveal className="flex flex-col items-start justify-between gap-8 rounded-2xl border border-plum/20 bg-plum-tint/50 p-8 md:flex-row md:items-center md:p-10">
            <div>
              <Eyebrow>Already using Purple Envelope?</Eyebrow>
              <h2 className="mt-3 font-display text-[1.65rem] font-medium leading-snug text-ink">
                Your training uses the same Purple Envelope account you already use at work.
              </h2>
              <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-ink-soft">
                No separate login, no second system. If you’re signed in, this takes you straight there.
              </p>
            </div>
            <Link
              to={trainingHref}
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white transition-colors hover:bg-plum-deep"
            >
              Open Training
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </Shell>
      </section>

      {/* ---------------- FINAL CTA ---------------- */}
      <section className="bg-plum-deep text-paper">
        <Shell className="py-20 text-center">
          <Reveal>
            <h2 className="mx-auto max-w-3xl font-display text-[clamp(2rem,4.6vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.02em]">
              Give the office a system, so it stops being a person.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[15.5px] leading-relaxed text-paper/70">
              Purple Envelope is in active development inside a live practice and opening to a small number of
              independent offices.
              <StatusTag>Early access</StatusTag>
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/start"
                className="rounded-full bg-paper px-7 py-3.5 text-[14.5px] font-medium text-plum-deep transition-transform hover:-translate-y-0.5"
              >
                Join early access
              </Link>
              <Link
                to="/features"
                className="rounded-full border border-paper/30 px-7 py-3.5 text-[14.5px] font-medium text-paper transition-colors hover:bg-paper/10"
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
