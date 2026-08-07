import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, Shell, Eyebrow, SectionTitle } from '@/marketing/primitives';

export default function MarketingAbout() {
  return (
    <MarketingLayout>
      <section className="border-b border-line">
        <Shell className="py-16 md:py-20">
          <Eyebrow>About</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.25rem,5.4vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em] text-ink">
            Built from inside the office it’s for.
          </h1>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
            Purple Envelope is practice-operations software for independent dental practices. It is being developed
            inside a working private practice, against real problems, on a real schedule.
          </p>
        </Shell>
      </section>

      <section className="border-b border-line bg-paper-2/50">
        <Shell className="grid gap-12 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal>
            <SectionTitle eyebrow="Why it exists" title="Small offices run critical operations on memory." />
          </Reveal>
          <Reveal delay={70}>
            <div className="space-y-5 text-[15.5px] leading-relaxed text-ink-soft">
              <p>
                An independent dental office runs payroll, cash handling, scheduling, insurance, compliance paperwork,
                training and hiring — usually with one manager, a handful of people, and no operations department.
              </p>
              <p>
                What holds it together is memory, paper, group texts, a few disconnected systems, and one or two
                people who know how everything works. That functions right up until it doesn’t: someone leaves,
                someone is out sick, or the office grows past what one person can personally track.
              </p>
              <p>
                Purple Envelope exists to move that load off people and into a system the office owns — without
                turning the office into a surveillance operation, and without pretending software can make leadership
                decisions for anyone.
              </p>
            </div>
          </Reveal>
        </Shell>
      </section>

      <section className="border-b border-line">
        <Shell className="py-16">
          <Reveal>
            <SectionTitle eyebrow="What we believe" title="Four positions that shape the product." />
          </Reveal>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
            {[
              [
                'Independent practices deserve real operational software.',
                'You shouldn’t need thirty locations to run a tight ship. The discipline that groups buy as software should be available to a single owner-led office.',
              ],
              [
                'Accountability is not surveillance.',
                'The system organizes facts, prepares wording and schedules follow-up. Disciplinary, employment, clinical and leadership judgment stays with people — and applies to owners too.',
              ],
              [
                'The patient boundary is a feature.',
                'Purple Envelope keeps the doctor’s standards, preferences and approved language so the team says the same thing to every patient. Charts, clinical records and patient-identifying information stay in your practice management software — practice guidance, not patient records.',
              ],
              [
                'Nothing gets marketed before it exists.',
                'If a capability is planned, this site labels it. We would rather look smaller than we are than sell something that isn’t there.',
              ],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 50} className="bg-paper">
                <div className="h-full p-7">
                  <h3 className="font-display text-[1.2rem] font-medium leading-snug text-ink">{title}</h3>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Shell>
      </section>

      <section className="border-b border-line bg-paper-2/50">
        <Shell className="py-16">
          <Reveal className="mx-auto max-w-2xl text-center">
            <Eyebrow className="mx-auto">Where things stand</Eyebrow>
            <p className="mt-5 text-[15.5px] leading-relaxed text-ink-soft">
              Purple Envelope is in active development and in daily use in the practice it was built in. It is opening
              to a small number of additional independent offices. We are not going to tell you how many customers we
              have, how much revenue we make, or quote testimonials we don’t have. When there is something real to
              report, it will be reported here.
            </p>
          </Reveal>
        </Shell>
      </section>

      <section className="bg-plum-deep text-paper">
        <Shell className="py-16 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.7rem,3.8vw,2.6rem)] font-medium leading-[1.07]">
            If you run an independent office, we want to hear how it actually works.
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
