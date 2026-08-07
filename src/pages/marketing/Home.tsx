import { Link } from 'react-router-dom';
import MarketingLayout, { useTrainingHref } from '@/marketing/MarketingLayout';
import { Reveal, Shell, BandHead, Btn } from '@/marketing/primitives';
import { EnvelopeMark } from '@/marketing/EnvelopeMark';
import RoleSelector, { RoleStoryBlock } from '@/marketing/RoleSelector';

/** Five, not eight. The weakest three were cut in the second pass. */
const PROBLEMS = [
  'Too much of the office lives in one person’s head.',
  'Tasks get handed off in the hallway and then evaporate.',
  'The manager spends the day chasing follow-up instead of managing.',
  'There are rules — they’re just hard to find.',
  'The owner hears about a problem three weeks after it started.',
];

const MODULES = [
  {
    n: '01',
    title: 'Run the day',
    body: 'Opening and closing checklists, Close the Day, the deposit log, the office calendar, time and attendance.',
    meta: 'Checklists · Close the Day · Deposit log · Calendar · Time',
  },
  {
    n: '02',
    title: 'Keep expectations clear',
    body:
      'Assignments, acknowledgments of an exact published version, approvals and requests. Blocked is not the same as ignored, and the system says which.',
    meta: 'Assignments · Acknowledgments · Approvals · Requests · Goals',
  },
  {
    n: '03',
    title: 'Train the team',
    body:
      'Modules, assignments and progress — including practice scenarios for the conversations that are actually hard.',
    meta: 'Modules · Assignments · Progress · Practice scenarios',
  },
  {
    n: '04',
    title: 'Keep office knowledge usable',
    body:
      'Handbook, procedures and the Insurance Desk under a governed publish flow: draft, review, approve, publish, supersede.',
    meta: 'Handbook · Procedures · Insurance Desk · Versioning',
  },
  {
    n: '05',
    title: 'Handle office forms better',
    body: 'Forms, consents and the financial workflows the front desk runs all day — as office documents, not a patient database.',
    meta: 'Forms & Consents · Financial options · Broken appointments',
  },
  {
    n: '06',
    title: 'See what needs attention',
    body: 'Owner and manager views over what is actually recorded: bypasses, exceptions, unread policies, missed follow-up.',
    meta: 'Dashboard · Notifications · Approvals · Exception signals',
  },
];

export default function MarketingHome() {
  const trainingHref = useTrainingHref();

  return (
    <MarketingLayout>
      {/* ═══════════ 01 · HERO ═══════════ */}
      <section className="relative border-b-2 border-ink">
        <Shell>
          {/* running head */}
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-1 border-b border-ink/15 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
            <span>Independent dental offices</span>
            <span className="text-plum">No DSOs</span>
            <span className="hidden sm:inline">Built inside a working private practice</span>
          </div>
        </Shell>

        <Shell className="relative pb-0 pt-10 sm:pt-14">
          <h1 className="pe-display text-[clamp(2.9rem,12.4vw,9.5rem)] text-ink">
            <span className="block">Run the</span>
            <span className="block">office.</span>
            <span className="mt-2 block text-plum">Without living</span>
            <span className="block text-plum">at the office.</span>
          </h1>

          <div className="mt-10 grid gap-8 border-t-2 border-ink pt-7 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
            <p className="max-w-[46ch] text-[1.0625rem] leading-relaxed text-ink sm:text-[1.15rem]">
              Purple Envelope is practice-operations software for independent dental offices. Daily workflows,
              training, office knowledge, forms, requests and accountability live in one place instead of in one
              person’s memory.
            </p>
            <div className="flex flex-wrap items-start gap-0 self-start">
              <Btn to="/start" tone="plum">
                Request access
              </Btn>
              <Btn href="#what-it-does" tone="ghost" className="border-l-0">
                What it does
              </Btn>
            </div>
          </div>
        </Shell>

        {/* the decisive purple field */}
        <div className="relative mt-12 bg-plum text-paper">
          <div className="pe-blueprint-invert pointer-events-none absolute inset-0 opacity-70" aria-hidden />
          <Shell className="relative grid items-center gap-10 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-20">
            <EnvelopeMark
              stroke={2}
              className="h-auto w-full max-w-[26rem] text-paper/85 lg:max-w-none"
            />
            <div>
              <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-paper/55">The whole idea</p>
              <p className="pe-display mt-5 text-[clamp(1.8rem,4.8vw,3.6rem)] text-paper">
                You shouldn’t need thirty locations to run a tight ship.
              </p>
              <p className="mt-6 max-w-[48ch] text-[15px] leading-relaxed text-paper/75">
                Groups buy operational discipline as software. Independent offices get a binder and a good manager.
                Purple Envelope is for the independents — one office today, with room in the design for a small
                owner-led group later.
              </p>
            </div>
          </Shell>
        </div>
      </section>

      {/* ═══════════ 02 · THE PROBLEM ═══════════ */}
      <section className="border-b-2 border-ink">
        <Shell className="py-16 lg:py-24">
          <Reveal>
            <BandHead
              index="02"
              kicker="The problem"
              title={<>An office can be run well and still be held together by memory.</>}
            />
          </Reveal>
          <Reveal delay={60}>
            <ol className="mt-12">
              {PROBLEMS.map((p, i) => (
                <li
                  key={p}
                  className="pe-row grid grid-cols-[3.5rem_1fr] items-baseline gap-x-4 py-6 last:border-b last:border-ink/16 sm:grid-cols-[7rem_1fr] sm:gap-x-10"
                >
                  <span className="pe-display text-[clamp(1.75rem,5vw,3.25rem)] leading-none text-plum/30">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="pe-display-tight max-w-[34ch] text-[clamp(1.05rem,2.4vw,1.65rem)] text-ink">
                    {p}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-10 max-w-[54ch] text-[15px] leading-relaxed text-ink-soft">
              None of this means anyone is doing a bad job. It means the office runs on people instead of systems —
              and people go home, get sick, and eventually leave.
            </p>
          </Reveal>
        </Shell>
      </section>

      {/* ═══════════ 03 · WHAT IT DOES ═══════════ */}
      <section id="what-it-does" className="scroll-mt-16 border-b-2 border-ink bg-paper-2">
        <Shell className="py-16 lg:py-24">
          <Reveal>
            <BandHead
              index="03"
              kicker="What Purple Envelope does"
              title="Six jobs, not thirty features."
              lede="Every part of the product exists because something in a real office kept falling through."
            />
          </Reveal>

          <div className="mt-14">
            {MODULES.map((m, i) => (
              <Reveal key={m.n} delay={i * 40}>
                <div className="pe-row grid gap-x-10 gap-y-3 py-8 last:border-b last:border-ink/16 lg:grid-cols-[6rem_15rem_1fr]">
                  <span className="pe-display text-[2.5rem] leading-none text-plum/30">{m.n}</span>
                  <h3 className="pe-display text-[1.35rem] text-ink">{m.title}</h3>
                  <div className="max-w-[58ch]">
                    <p className="text-[14.5px] leading-relaxed text-ink">{m.body}</p>
                    <p className="mt-3 font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-soft">{m.meta}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Link
            to="/features"
            className="pe-focus mt-10 inline-block font-mono text-[11px] uppercase tracking-[0.18em] text-plum underline underline-offset-8"
          >
            See the full product tour →
          </Link>
        </Shell>
      </section>

      {/* ═══════════ 04 · ROLE VIEW ═══════════ */}
      <section className="border-b-2 border-ink">
        <Shell className="py-16 lg:py-24">
          <Reveal>
            <RoleSelector />
          </Reveal>
          <Reveal className="mt-14" delay={60}>
            <RoleStoryBlock />
          </Reveal>
          <p className="mt-12 border-t border-ink/15 pt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
            This only changes what you read here. Real permissions come from your Purple Envelope account.
          </p>
        </Shell>
      </section>

      {/* ═══════════ 05 · PRIVACY FIELD ═══════════ */}
      <section className="border-b-2 border-ink bg-ink text-paper">
        <Shell className="grid gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-24">
          <Reveal>
            <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-paper/50">Privacy posture</p>
            <p className="pe-display mt-6 text-[clamp(2.1rem,6.4vw,4.5rem)] text-paper">
              Only your business,
              <span className="block text-plum-tint">never your patients.</span>
            </p>
          </Reveal>
          <Reveal delay={60} className="self-end">
            <div className="space-y-4 text-[15px] leading-relaxed text-paper/70">
              <p>
                Purple Envelope is deliberately the business side of the practice. It is not a patient-record system
                and does not replace your practice management software.
              </p>
              <p>
                Personal notes stay with their author, and direct messages stay with their participants — owners
                included. Training attempts are still visible to administrators in your own office today; we say so on
                the security page rather than imply otherwise. Accountability applies to owners and managers too.
              </p>
            </div>
            <Link
              to="/security"
              className="pe-focus mt-7 inline-block border-b border-plum-tint pb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-plum-tint"
            >
              Read what is actually enforced →
            </Link>
          </Reveal>
        </Shell>
      </section>

      {/* ═══════════ 06 · CLOSE ═══════════ */}
      <section className="bg-paper">
        <Shell className="py-16 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-20">
            <div>
              <h2 className="pe-display text-[clamp(2rem,6vw,4rem)] text-ink">
                Give the office a system, so it stops being a person.
              </h2>
              <div className="mt-9 flex flex-wrap gap-0">
                <Btn to="/start" tone="plum">
                  Request access
                </Btn>
                <Btn to="/features" tone="ghost" className="border-l-0">
                  Explore the product
                </Btn>
              </div>
              <p className="mt-6 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-soft">
                In active development inside a live practice, opening to a small number of independent offices.
              </p>
            </div>

            <div className="self-end border-t-2 border-ink pt-6">
              <p className="font-mono text-[11.5px] uppercase tracking-[0.22em] text-ink-soft">
                Already using Purple Envelope?
              </p>
              <p className="pe-display-tight mt-4 text-[1.2rem] text-ink">
                Training uses the same account you already use at work.
              </p>
              <Link
                to={trainingHref}
                className="pe-focus mt-5 inline-block border-b-2 border-plum pb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-plum"
              >
                Open Training →
              </Link>
            </div>
          </div>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
