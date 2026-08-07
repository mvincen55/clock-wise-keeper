import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, Shell, Eyebrow, SectionTitle } from '@/marketing/primitives';
import RoleSelector from '@/marketing/RoleSelector';
import { AttentionQueueVisual, KnowledgeVisual, RequestStatusVisual } from '@/marketing/ProductVisuals';
import { useMarketingRole } from '@/marketing/roles';
import { cn } from '@/lib/utils';

const SECTIONS = [
  {
    id: 'owner' as const,
    eyebrow: 'For the dentist / owner',
    title: 'See the office without becoming the office manager.',
    body:
      'You are chairside. You cannot also be the person who notices that the closing checklist has been skipped four Thursdays in a row. Purple Envelope watches the operational record so you can look at exceptions instead of everything.',
    scenario: {
      title: 'A Thursday in a real office',
      steps: [
        'Closing checklist is bypassed at 5:10pm with the reason “ran late, front still on the phone.”',
        'A manager is notified. Nothing lands on the owner yet — one bypass is not a problem.',
        'It happens twice more in three weeks with no resolution.',
        'Now it reaches the owner as a pattern, with the dates, the reasons and who reviewed each one.',
      ],
    },
    visual: 'attention' as const,
  },
  {
    id: 'manager' as const,
    eyebrow: 'For the office manager',
    title: 'Stop being the place where every unfinished thought has to live.',
    body:
      'The manager job is often described as “keeping track of everything.” That is a systems failure with a person standing in for it. Purple Envelope takes the tracking so you can do the managing.',
    scenario: {
      title: 'The new hygienist starts Monday',
      steps: [
        'You invite her with a start date, opening PTO balance and her weekly schedule.',
        'On acceptance, her schedule, attendance and PTO are seeded — no spreadsheet, no first-week guessing.',
        'The onboarding policies she needs are assigned automatically and due on her actual working days.',
        'On Wednesday you can see what she has read and what is still open, without asking her.',
      ],
    },
    visual: 'knowledge' as const,
  },
  {
    id: 'team' as const,
    eyebrow: 'For the team',
    title: 'Know what’s expected, where to find it, and what happens next.',
    body:
      'Most workplace frustration isn’t about being held accountable. It’s about being held accountable for something nobody wrote down. Everything assigned to you is visible, and so is the rule behind it.',
    scenario: {
      title: 'You need two days off in March',
      steps: [
        'Request it from your phone with the dates and a note.',
        'You can see the status: submitted, seen, decided — and who has it.',
        'If it needs coverage, the conflict is visible instead of implied.',
        'The decision and the reason stay attached to the request.',
      ],
    },
    visual: 'request' as const,
  },
];

export default function MarketingForDental() {
  const [role] = useMarketingRole();

  return (
    <MarketingLayout>
      <section className="border-b border-line">
        <Shell className="py-16 md:py-20">
          <Eyebrow>For independent dental practices</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.25rem,5.4vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em] text-ink">
            The same office looks different depending on where you sit.
          </h1>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
            An owner, a manager and a team member each need something different from the same set of facts. Below is
            what Purple Envelope does for each of them — with the actual situations it was built around.
          </p>
          <div className="mt-9">
            <RoleSelector />
          </div>
        </Shell>
      </section>

      {SECTIONS.map((s, i) => {
        const highlighted = role === s.id;
        return (
          <section
            key={s.id}
            id={s.id}
            className={cn(
              'scroll-mt-20 border-b border-line transition-colors duration-500',
              highlighted ? 'bg-plum-tint/45' : i % 2 === 1 ? 'bg-paper-2/50' : '',
            )}
          >
            <Shell className="grid gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
              <Reveal className={cn(i % 2 === 1 && 'lg:order-2')}>
                <div className="flex items-center gap-3">
                  <Eyebrow>{s.eyebrow}</Eyebrow>
                  {highlighted && (
                    <span className="rounded-full bg-plum px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white">
                      Your view
                    </span>
                  )}
                </div>
                <h2 className="mt-4 font-display text-[clamp(1.7rem,3.6vw,2.6rem)] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
                  {s.title}
                </h2>
                <p className="mt-5 max-w-xl text-[15.5px] leading-relaxed text-ink-soft">{s.body}</p>

                <div className="mt-8 rounded-xl border border-line bg-white/70 p-6">
                  <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-plum/70">{s.scenario.title}</p>
                  <ol className="mt-4 space-y-3">
                    {s.scenario.steps.map((step, n) => (
                      <li key={step} className="flex gap-3 text-[14px] leading-relaxed text-ink">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-plum/10 font-mono text-[11px] text-plum">
                          {n + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>
              <Reveal delay={70} className={cn('flex items-center', i % 2 === 1 && 'lg:order-1')}>
                {s.visual === 'attention' && <AttentionQueueVisual className="w-full" />}
                {s.visual === 'knowledge' && <KnowledgeVisual className="w-full" />}
                {s.visual === 'request' && <RequestStatusVisual className="w-full" />}
              </Reveal>
            </Shell>
          </section>
        );
      })}

      <section className="border-b border-line">
        <Shell className="py-20">
          <Reveal>
            <SectionTitle
              align="center"
              eyebrow="A note on fairness"
              title="Accountability that only points downward isn’t accountability."
              lede="Owner decisions, manager reviews and unanswered questions are tracked the same way as anyone else’s tasks. There are no rankings, no scores and no public shaming — status describes work, not a person."
            />
          </Reveal>
        </Shell>
      </section>

      <section className="bg-plum-deep text-paper">
        <Shell className="py-16 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.8rem,4vw,2.8rem)] font-medium leading-[1.06]">
            If this sounds like your office, we’d like to hear how it runs.
          </h2>
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
