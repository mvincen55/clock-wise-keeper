import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Reveal, Shell, Eyebrow, SectionTitle } from '@/marketing/primitives';
import { Check, X } from 'lucide-react';

const DESIGNED_TO_HOLD = [
  'Employee and office operational records: schedules, punches, PTO, attendance',
  'Office policies, procedures and handbook content with version history',
  'Assignments, acknowledgments, approvals, requests and their audit trail',
  'Training assignments and progress',
  'Deposit and cash-handling records for the business',
  'Office configuration: roles, fee configuration, closures, calendars',
  'Internal office messages and announcements between team members',
];

const NOT_DESIGNED_TO_HOLD = [
  'A patient chart or clinical record',
  'A replacement for your practice management software',
  'Imaging, treatment notes or clinical documentation',
  'A patient communication platform',
  'Insurance claims processing',
  'Anything that requires us to be your system of record for patients',
];

const CONTROLS = [
  {
    title: 'Organization-scoped data',
    body:
      'Every operational record is scoped to your office. Database-level row security policies enforce that scoping on the server, not just in the interface — a query from one office cannot return another office’s rows.',
  },
  {
    title: 'Role-based access',
    body:
      'Owner, manager and team access are distinct. Roles are stored server-side in a dedicated table and checked by the database, never inferred from anything the browser can change.',
  },
  {
    title: 'Invite-based access',
    body:
      'People join an office by invitation from an owner or manager. There is no open self-signup into an existing office, and outstanding invites can be revoked.',
  },
  {
    title: 'Immutable operational history',
    body:
      'Time punches are never edited in place — a correction supersedes the original and both remain. Sensitive changes record actor, timestamp, before/after and a required reason.',
  },
  {
    title: 'Separation of review',
    body:
      'Nobody approves, resolves or countersigns their own record. Published office knowledge requires a genuine second-person approval.',
  },
  {
    title: 'Private conversations stay private',
    body:
      'Owners and managers cannot browse private training conversations, coaching dialogue or reflections. Our integrity monitoring looks at system and abuse signals — it does not read message content.',
  },
  {
    title: 'Transient form data handled separately',
    body:
      'Some patient-facing paperwork is filled in, printed or handed over and is not retained as persistent business data. Where a workflow works that way, the product is built so the values pass through the page rather than accumulating in the database.',
  },
  {
    title: 'Least-exposure AI',
    body:
      'AI features run through a scrubbing layer intended to strip identifying values before anything leaves the application, and they are not permitted to browse private conversations.',
  },
];

export default function MarketingSecurity() {
  return (
    <MarketingLayout>
      <section className="border-b border-line">
        <Shell className="py-16 md:py-20">
          <Eyebrow>Security &amp; trust</Eyebrow>
          <h1 className="mt-5 max-w-3xl font-display text-[clamp(2.25rem,5.4vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em] text-ink">
            We’d rather be specific than reassuring.
          </h1>
          <p className="mt-6 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
            This page describes how Purple Envelope actually handles access and data today, and states plainly what
            we have not done. If a claim isn’t on this page, assume we haven’t made it.
          </p>
        </Shell>
      </section>

      <section className="border-b border-line bg-paper-2/50">
        <Shell className="py-16">
          <Reveal>
            <SectionTitle
              eyebrow="The boundary"
              title="What Purple Envelope is designed to hold — and what it isn’t."
              lede="This is the single most important thing to understand about the product. The boundary is deliberate, and it shapes every feature decision."
            />
          </Reveal>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-2xl border border-plum/25 bg-white p-7">
                <h3 className="font-display text-[1.3rem] font-medium text-ink">Designed to hold</h3>
                <ul className="mt-5 space-y-3">
                  {DESIGNED_TO_HOLD.map((i) => (
                    <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-plum" />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={70}>
              <div className="h-full rounded-2xl border border-line bg-paper p-7">
                <h3 className="font-display text-[1.3rem] font-medium text-ink">Not designed to hold</h3>
                <ul className="mt-5 space-y-3">
                  {NOT_DESIGNED_TO_HOLD.map((i) => (
                    <li key={i} className="flex gap-3 text-[14px] leading-relaxed text-ink-soft">
                      <X className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft/60" />
                      {i}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-line pt-5 font-display text-[15px] text-plum">
                  Only your business, never your patients.
                </p>
              </div>
            </Reveal>
          </div>
        </Shell>
      </section>

      <section className="border-b border-line">
        <Shell className="py-16">
          <Reveal>
            <SectionTitle eyebrow="How access works" title="The controls that are actually in place." />
          </Reveal>
          <dl className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2">
            {CONTROLS.map((c, i) => (
              <Reveal key={c.title} delay={i * 40} className="bg-paper">
                <div className="h-full p-7">
                  <dt className="font-display text-[1.15rem] font-medium text-ink">{c.title}</dt>
                  <dd className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{c.body}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </Shell>
      </section>

      <section className="border-b border-line bg-plum-deep text-paper">
        <Shell className="py-16">
          <Reveal>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/50">What we do not claim</p>
            <h2 className="mt-5 max-w-2xl font-display text-[clamp(1.7rem,3.6vw,2.5rem)] font-medium leading-[1.08]">
              No certifications, no audit badges, no absolutes.
            </h2>
            <ul className="mt-8 grid max-w-4xl gap-3 md:grid-cols-2">
              {[
                'Purple Envelope is not HIPAA certified. No such certification exists, and we don’t imply one.',
                'We have not completed a SOC 2 examination.',
                'We have not had a third-party security audit or penetration test.',
                'We are not offering a BAA at this time.',
                'No software is unhackable, and we won’t pretend otherwise.',
              ].map((i) => (
                <li key={i} className="flex gap-3 rounded-lg bg-paper/8 p-4 text-[14px] leading-relaxed text-paper/85">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-paper/50" />
                  {i}
                </li>
              ))}
            </ul>
            <p className="mt-8 max-w-2xl text-[14.5px] leading-relaxed text-paper/70">
              These are honest gaps for a product at this stage, and part of why the patient-data boundary matters so
              much: we keep the sensitive category of data out of the system rather than claiming we’ve solved it.
            </p>
          </Reveal>
        </Shell>
      </section>

      <section>
        <Shell className="py-16">
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-line bg-paper-2/60 p-8 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-[1.4rem] font-medium text-ink">Have a specific security question?</h2>
              <p className="mt-2 max-w-xl text-[14.5px] leading-relaxed text-ink-soft">
                Ask it directly. If we haven’t done something, we’ll say we haven’t done it. Our privacy and terms
                document is also public.
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <Link to="/start" className="rounded-full bg-plum px-6 py-3.5 text-[14.5px] font-medium text-white">
                Ask us
              </Link>
              <Link
                to="/privacy"
                className="rounded-full border border-line bg-white px-6 py-3.5 text-[14.5px] font-medium text-ink"
              >
                Privacy &amp; Terms
              </Link>
            </div>
          </Reveal>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
