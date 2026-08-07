import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, SectionTitle, Shell, Eyebrow, StatusTag } from '@/marketing/primitives';
import { CloseTheDayVisual, AcknowledgmentVisual, RequestStatusVisual } from '@/marketing/ProductVisuals';
import { ArrowRight } from 'lucide-react';

interface Area {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  rows: { name: string; body: string; status?: string }[];
}

const AREAS: Area[] = [
  {
    id: 'daily',
    eyebrow: 'Daily operations',
    title: 'The day has a shape, and you can see where it is.',
    lede: 'Opening and closing routines stop being a verbal habit and become something with a record.',
    rows: [
      { name: 'Checklists', body: 'Recurring opening, closing and role-specific lists with completion recorded per person.' },
      { name: 'Close the Day', body: 'The end-of-day routine as one flow: what was finished, what was skipped, and why.' },
      { name: 'Checklist bypass loop', body: 'Bypassing takes a short reason. First low-risk bypass notifies a manager; repeated unresolved bypasses rise to the owner.' },
      { name: 'Deposit log', body: 'Counted deposits with an immutable history — actor, timestamp, before/after — plus printable office and bank copies.' },
      { name: 'Office calendar', body: 'Office closures, holidays, coverage and practice events in one shared calendar.' },
      { name: 'Morning huddle', body: 'A structured start-of-day view built from what the office already tracks.' },
    ],
  },
  {
    id: 'accountability',
    eyebrow: 'Team & accountability',
    title: 'Say it once. See who actually got it.',
    lede: 'Accountability that applies to owners and managers as much as to anyone else, with delay states that tell the truth.',
    rows: [
      { name: 'Assignments', body: 'Work assigned to a named person with a due date on their real working days — not calendar days.' },
      { name: 'Acknowledgments', body: 'Receipt of the exact published version, recorded immutably. Acknowledgment is not agreement, and nobody signs for anyone else.' },
      { name: 'Delay states', body: 'Blocked, snoozed with a reason, awaiting an answer, not scheduled to work, or genuinely ignored — kept distinct instead of all being “overdue.”' },
      { name: 'Escalation receipts', body: 'Every notice, block, question, answer, reminder and escalation step is recorded on one reviewable trail.' },
      { name: 'Goals', body: 'Office and individual goals with check-ins and progress, including a printable monthly report.' },
      { name: 'Review separation', body: 'Nobody reviews, approves or resolves their own record.' },
    ],
  },
  {
    id: 'training',
    eyebrow: 'Training',
    title: 'Training that doesn’t depend on who’s free to explain it.',
    lede: 'The same account people already use at work — one training system, not a separate portal.',
    rows: [
      { name: 'Modules & assignments', body: 'Assign training to a person or a role and see progress.' },
      { name: 'Practice scenarios', body: 'Roleplay-style practice for the conversations that are hard to teach by watching.' },
      { name: 'Private by design', body: 'Training and coaching conversations are not browsable by owners or managers.' },
    ],
  },
  {
    id: 'forms',
    eyebrow: 'Forms & consents',
    title: 'Office paperwork that behaves like a real document system.',
    lede: 'Built as versioned office documents, not as another place to accumulate patient records.',
    rows: [
      { name: 'Form library & builder', body: 'Build and version the office’s consent and administrative forms.' },
      { name: 'Bundles', body: 'Group the forms that always go out together so the front desk isn’t assembling packets by hand.' },
      { name: 'Financial options', body: 'Treatment/financial option presentation built off the office’s own fee configuration.' },
      { name: 'Broken appointments', body: 'A consistent, escalating response to short-notice cancellations and no-shows.' },
    ],
  },
  {
    id: 'knowledge',
    eyebrow: 'Office knowledge',
    title: 'One current answer, not four confident ones.',
    lede: 'Governed publishing: draft, in review, approved, published, superseded. Publication requires a second person.',
    rows: [
      { name: 'Office Handbook', body: 'The office’s policies where people can actually find them, with version history.' },
      { name: 'Procedures', body: 'Step-by-step office procedures, owned and reviewable.' },
      { name: 'Insurance Desk', body: 'The plan-by-plan notes and quirks the front desk relearns every month.' },
      { name: 'Important numbers', body: 'Labs, vendors, service, emergency contacts — current and shared.' },
    ],
  },
  {
    id: 'time',
    eyebrow: 'Time, attendance & PTO',
    title: 'Payroll-grade records with a visible audit trail.',
    lede: 'Punches are immutable. Corrections supersede rather than overwrite, and every edit carries a reason.',
    rows: [
      { name: 'Time clock', body: 'Clock in and out with multiple punch pairs per day, in the office’s own time zone.' },
      { name: 'Schedules', body: 'Date-ranged schedule versions per person, with history kept.' },
      { name: 'Attendance', body: 'Planned vs unplanned absence handled differently, with day status kept current automatically.' },
      { name: 'PTO', body: 'Accrual and balances driven by the office’s own policy configuration, with requests and approvals.' },
      { name: 'Corrections', body: 'Punch corrections request → review → decision, with mandatory comments and a full audit record.' },
      { name: 'Work zones', body: 'Location-aware clock-in support for offices that want it.' },
    ],
  },
  {
    id: 'visibility',
    eyebrow: 'Owner & manager visibility',
    title: 'The exceptions, not a firehose.',
    lede: 'What surfaces to an owner is what is unresolved, repeated, or waiting specifically on them.',
    rows: [
      { name: 'Owner dashboard', body: 'Today’s state of the office plus the items that need a decision.' },
      { name: 'Approval queue', body: 'Time off, corrections and requests in one place with clear status.' },
      { name: 'Notifications', body: 'In-app notices that deep-link to the exact record.' },
      { name: 'Reports', body: 'Timesheet, goal and attendance exports for payroll and review.' },
      { name: 'Operational signals', body: 'Bypasses, exceptions, unacknowledged policies and repeated patterns made visible.' },
    ],
  },
  {
    id: 'comms',
    eyebrow: 'Communication & requests',
    title: 'The conversation and the follow-up in the same place.',
    lede: 'So a decision made in a message doesn’t need a second life as a sticky note.',
    rows: [
      { name: 'Messaging', body: 'Direct and group messages plus office announcements, inside the office account.' },
      { name: 'Requests', body: 'Time off, corrections and questions with a visible status and owner.' },
      { name: 'Report a problem', body: 'A support entry point on every page for when something in the software is wrong.' },
      { name: 'Email delivery', body: 'Routine notices continue by email when in-app notice isn’t enough, with idempotent, retryable delivery.' },
    ],
  },
];

export default function MarketingFeatures() {
  return (
    <MarketingLayout>
      <section className="border-b border-line">
        <Shell className="py-16 md:py-20">
          <Eyebrow>Product tour</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.25rem,5.4vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em] text-ink">
            Everything the office runs on, in one account.
          </h1>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
            Grouped by the job it does, using the same words the product uses. If something below is planned rather
            than live, it says so.
          </p>
          <nav aria-label="Product areas" className="mt-9 flex flex-wrap gap-2">
            {AREAS.map((a) => (
              <a
                key={a.id}
                href={`#${a.id}`}
                className="rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-[12.5px] text-ink-soft transition-colors hover:border-plum/40 hover:text-plum"
              >
                {a.eyebrow}
              </a>
            ))}
          </nav>
        </Shell>
      </section>

      {AREAS.map((area, idx) => (
        <section
          key={area.id}
          id={area.id}
          className={`scroll-mt-20 border-b border-line ${idx % 2 === 1 ? 'bg-paper-2/50' : ''}`}
        >
          <Shell className="grid gap-10 py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal>
              <SectionTitle eyebrow={area.eyebrow} title={area.title} lede={area.lede} />
              {idx === 0 && <CloseTheDayVisual className="mt-8 max-w-sm" />}
              {idx === 1 && <AcknowledgmentVisual className="mt-8 max-w-sm" />}
              {idx === 7 && <RequestStatusVisual className="mt-8 max-w-sm" />}
            </Reveal>
            <Reveal delay={70}>
              <dl className="divide-y divide-line border-y border-line">
                {area.rows.map((r) => (
                  <div key={r.name} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-6">
                    <dt className="text-[14px] font-medium text-ink">
                      {r.name}
                      {r.status && <StatusTag>{r.status}</StatusTag>}
                    </dt>
                    <dd className="text-[13.5px] leading-relaxed text-ink-soft">{r.body}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </Shell>
        </section>
      ))}

      <section className="bg-plum-deep text-paper">
        <Shell className="flex flex-col items-start justify-between gap-6 py-16 md:flex-row md:items-center">
          <div>
            <h2 className="font-display text-[clamp(1.6rem,3.4vw,2.4rem)] font-medium leading-tight">
              Want to see it against your office?
            </h2>
            <p className="mt-2 text-[15px] text-paper/70">
              Tell us how your office runs today and we’ll be straight about what fits and what doesn’t.
            </p>
          </div>
          <Link
            to="/start"
            className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-paper px-6 py-3.5 text-[14.5px] font-medium text-plum-deep"
          >
            Talk to us
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
