import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, SectionTitle, Shell, Eyebrow, StatusTag } from '@/marketing/primitives';
import { ArrowRight, Lock, ShieldCheck, EyeOff, FileClock, Bot, Users } from 'lucide-react';

/**
 * Security page.
 *
 * Every statement here was checked against the actual implementation. Where the
 * product does not yet do something, it says so plainly rather than implying it.
 * If the code changes, this page has to change with it.
 */

const PILLARS = [
  {
    icon: Users,
    title: 'One office cannot see another',
    body:
      'Every operational record carries the office it belongs to, and the database — not the browser — decides what you are allowed to read or write. Row-level security is enabled across the application tables, and requests are evaluated against your signed-in identity on the server.',
  },
  {
    icon: Lock,
    title: 'Invitation only',
    body:
      'There is no public sign-up. An account can only reach an office after an owner or manager invites that email address; anything else is refused at sign-in and by the database itself.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles are enforced on the server',
    body:
      'Owner, manager and team member are database-level facts. Hiding a button in the interface is not our access control — the same rules are applied again in the database on every read and write.',
  },
  {
    icon: FileClock,
    title: 'The record keeps its history',
    body:
      'Time punches are never edited in place; corrections supersede the original and both remain. Sensitive changes record who, when, before, after and why. Published policy versions and the acknowledgments against them cannot be quietly rewritten.',
  },
  {
    icon: EyeOff,
    title: 'Not everything is management-visible',
    body:
      'Private notes are readable only by their author. Direct messages are scoped to their participants. Our monitoring for tampering and abuse looks at system-level signals, not at the contents of your conversations.',
  },
  {
    icon: Bot,
    title: 'AI features are fenced',
    body:
      'Text is scrubbed for identifiers before it is sent to a model, and AI features are wired to a fixed set of office capabilities. AI does not roam the codebase and does not read private message threads.',
  },
];

const BOUNDARY = [
  ['What Purple Envelope is for', 'Running the business side of the practice: schedules, time, training, policies, requests, checklists, deposits, office documents.'],
  ['What it is not', 'A patient record system, a clinical chart, or a replacement for your practice management software.'],
  ['Patient-facing forms', 'Forms and consents are completed in the browser and handed off — the completed form is not kept as a patient database inside Purple Envelope.'],
  ['Your responsibility', 'Because staff can type anything into a free-text box, keep patient identifiers out of Purple Envelope unless your office has agreed a compliant workflow with us in writing.'],
];

const HONEST = [
  [
    'We do not claim a HIPAA certification',
    'No such certification exists. What we can describe is the boundary above and how access is enforced — and we would rather do that than post a badge.',
  ],
  [
    'Training practice conversations are not fully private yet',
    'Roleplay attempts are currently visible to office administrators. We are narrowing that so practice dialogue stays with the learner. Until it ships, we will not claim otherwise.',
  ],
  [
    'Some older schedule tables are scoped indirectly',
    'A few legacy tables inherit their office through the employee record rather than carrying it directly. Access is still enforced; we are migrating them to direct scoping.',
  ],
  [
    'Serious-risk exceptions are disclosed, not hidden',
    'If a narrow safety or integrity trigger ever surfaces something from private content, it is defined in advance, visible in settings, limited to a structured alert, and access-audited. No transcript dumps.',
  ],
];

export default function MarketingSecurity() {
  return (
    <MarketingLayout>
      <section className="border-b-2 border-ink/85">
        <Shell className="py-16 md:py-20">
          <Reveal className="max-w-3xl">
            <span className="h-px w-10 bg-plum" aria-hidden />
            <Eyebrow className="mt-5">Security &amp; privacy</Eyebrow>
            <h1 className="mt-4 font-display text-[clamp(2.1rem,5vw,3.4rem)] font-medium leading-[1.03] tracking-[-0.025em] text-ink">
              Only your business,
              <span className="block text-plum">never your patients.</span>
            </h1>
            <p className="mt-6 text-[1.0625rem] leading-relaxed text-ink-soft">
              This page describes how Purple Envelope actually behaves — what is enforced, what is visible to whom, and
              what is still being tightened. We would rather be specific and unflattering than vague and reassuring.
            </p>
          </Reveal>
        </Shell>
      </section>

      <section className="border-b border-line bg-paper-2/60">
        <Shell className="py-18 md:py-20">
          <Reveal>
            <SectionTitle eyebrow="How access works" title="Six things that are true of every office." />
          </Reveal>
          <div className="mt-12 grid gap-px border border-ink/80 bg-line md:grid-cols-2">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 50} className="bg-paper">
                <div className="flex h-full gap-5 p-7">
                  <p.icon className="mt-0.5 h-5 w-5 shrink-0 text-plum" aria-hidden />
                  <div>
                    <h3 className="font-display text-[1.2rem] font-medium leading-snug text-ink">{p.title}</h3>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{p.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      <section className="border-b border-line">
        <Shell className="grid gap-12 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <Reveal>
            <SectionTitle
              eyebrow="The patient boundary"
              title="The line we drew on purpose."
              lede="Most of the risk in dental software comes from mixing clinical data into everything else. Purple Envelope stays on the operations side of that line."
            />
          </Reveal>
          <Reveal delay={70}>
            <dl className="border-t border-ink/80">
              {BOUNDARY.map(([term, def]) => (
                <div key={term} className="grid gap-2 border-b border-line py-5 sm:grid-cols-[0.6fr_1fr] sm:gap-8">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-plum/80">{term}</dt>
                  <dd className="text-[14px] leading-relaxed text-ink-soft">{def}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Shell>
      </section>

      <section className="border-b border-line bg-paper-2/60">
        <Shell className="py-20">
          <Reveal>
            <SectionTitle
              eyebrow="What we will not overstate"
              title="The honest limits."
              lede="Anything on this list is either a deliberate boundary or work in progress. It stays here until it is genuinely finished."
            />
          </Reveal>
          <div className="mt-12 grid gap-px border border-ink/80 bg-line md:grid-cols-2">
            {HONEST.map(([title, body], i) => (
              <Reveal key={title} delay={i * 50} className="bg-paper">
                <div className="h-full p-7">
                  <p className="font-display text-[1.1rem] font-medium leading-snug text-ink">
                    {title}
                    {i === 1 && <StatusTag>In progress</StatusTag>}
                  </p>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{body}</p>
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
              Have a question this page didn’t answer?
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-paper/70">
              Ask it before you commit an office to anything. We will answer specifically, including when the answer is
              “not yet”.
            </p>
            <Link
              to="/start"
              className="group mt-8 inline-flex min-h-[48px] items-center gap-2 bg-paper px-7 py-3.5 text-[14.5px] font-medium text-plum-deep transition-colors hover:bg-white"
            >
              Ask us directly
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
