import { Link } from 'react-router-dom';
import MarketingLayout from '@/marketing/MarketingLayout';
import { Shell, Reveal, BandHead } from '@/marketing/primitives';
import { EnvelopeMark } from '@/marketing/EnvelopeMark';

/**
 * Evidence-led trust page.
 *
 * Every VERIFIED row below corresponds to something enforced in the database
 * (RLS policy, constraint, security-definer function) or covered by a test in
 * src/test. Anything that is only partly true lives under LIMITS. No
 * certifications, audit badges, compliance absolutes or BAA claims appear
 * anywhere on this page — none of those exist yet.
 */

const VERIFIED: { claim: string; how: string }[] = [
  {
    claim: 'Office data is isolated by row-level security',
    how: 'Core records are scoped to one office by row-level security policies in the database — directly through an office column, or relationally through the employee record on some older tables. The rule is applied by the database, not by the screen.',
  },
  {
    claim: 'Access is invitation-only',
    how: 'Sign-in is gated by a server-side allowlist check. An authenticated account that has not been invited into an office is denied at the boundary, not hidden in the UI.',
  },
  {
    claim: 'Roles are enforced in the database, not the interface',
    how: 'Owner, manager and member permissions are evaluated by security-definer role functions inside the database policies. Hiding a button is not the control.',
  },
  {
    claim: 'A time correction preserves the original punch',
    how: 'The correction workflow does not overwrite a punch. The original is superseded and a new row is added. Where a privileged administrator changes a punch row directly, a database trigger records the change with before and after values.',
  },
  {
    claim: 'Sensitive changes keep who, when, before, after and why',
    how: 'Manual edits to time, deposits, checklists and configuration require a comment and write an audit event with the before/after values.',
  },
  {
    claim: 'Published policy versions and acknowledgments are frozen',
    how: 'Publication creates a fixed version. An acknowledgment records the exact version read, and database guards reject edits to published history.',
  },
  {
    claim: 'A record cannot be signed off by the person it is about',
    how: 'Accountability and incident countersignatures are rejected by the database function itself when the signer is the subject of the record.',
  },
  {
    claim: 'Private notes and direct messages are scoped to their participants',
    how: 'Personal notes are readable only by their author. Direct messages and group threads are readable only by participants — owners included, with no administrative read policy.',
  },
  {
    claim: 'Integrity monitoring reads system signals, not message content',
    how: 'The integrity layer records events such as failed authorisation and tampering signals. Conversation text is not one of its inputs.',
  },
  {
    claim: 'Free text sent to a model is classified and scrubbed first',
    how: 'Every function that calls a model is listed in a checked allowlist, and the ones carrying staff free text run it through a shared identifier scrubber. A test suite fails if a new AI caller skips either step.',
  },
];


const BOUNDARIES: { claim: string; how: string }[] = [
  {
    claim: 'This is not a patient-record system',
    how: 'Purple Envelope is the business side of the practice. It does not replace your practice management software and is not designed to hold a patient chart.',
  },
  {
    claim: 'Office forms are documents, not a patient database',
    how: 'Forms and consents are produced and printed as office documents. They are not modelled, indexed or reported on as clinical records.',
  },
  {
    claim: 'Accountability applies upward too',
    how: 'Owner and manager delays, blocks and unresolved decisions are recorded the same way anyone else’s are. There is no downward-only surveillance mode.',
  },
  {
    claim: 'Delay is not automatically misconduct',
    how: 'Blocked, snoozed with a reason, awaiting an answer and not-scheduled are distinct states. The system does not collapse them into “late”.',
  },
];

const LIMITS: { claim: string; how: string }[] = [
  {
    claim: 'Training roleplay attempts are visible to administrators today',
    how: 'The intent is that practice conversations stay private to the learner. Right now an administrator in your own office can see attempts. We are narrowing this, and we would rather say so than imply otherwise.',
  },
  {
    claim: 'Some legacy scheduling tables are scoped indirectly',
    how: 'A few older tables inherit their office scope through the employee record rather than carrying an office column of their own. They are still protected, but the scoping is one hop away and is being migrated.',
  },
  {
    claim: 'No certification, audit report or BAA is claimed',
    how: 'We hold no third-party security certification, have published no external audit, and do not offer a business-associate agreement. When any of that changes, it will be stated here with the date.',
  },
];

function Rows({
  rows,
  tone = 'ink',
}: {
  rows: { claim: string; how: string }[];
  tone?: 'ink' | 'paper';
}) {
  const paper = tone === 'paper';
  return (
    <div className="mt-10">
      {rows.map((r, i) => (
        <div
          key={r.claim}
          className={`grid gap-x-10 gap-y-2 border-t py-6 last:border-b lg:grid-cols-[4rem_1fr_1.25fr] ${
            paper ? 'border-paper/25' : 'border-ink/16'
          }`}
        >
          <span
            className={`font-mono text-[11px] tabular-nums tracking-[0.2em] ${paper ? 'text-paper/45' : 'text-plum'}`}
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3 className={`pe-display-tight text-[1.1rem] ${paper ? 'text-paper' : 'text-ink'}`}>{r.claim}</h3>
          <p className={`max-w-[62ch] text-[14.5px] leading-relaxed ${paper ? 'text-paper/70' : 'text-ink-soft'}`}>
            {r.how}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function MarketingSecurity() {
  return (
    <MarketingLayout>
      {/* masthead */}
      <section className="border-b-2 border-ink">
        <Shell>
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-1 border-b border-ink/15 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
            <span>Security &amp; privacy</span>
            <span className="text-plum">Claims constrained to what the code enforces</span>
          </div>
        </Shell>
        <Shell className="grid gap-10 py-14 lg:grid-cols-[1.25fr_0.75fr] lg:items-end lg:gap-16 lg:py-20">
          <div>
            <h1 className="pe-display text-[clamp(2.4rem,8vw,5.5rem)] text-ink">
              What we can
              <span className="block text-plum">actually prove.</span>
            </h1>
            <p className="mt-8 max-w-[52ch] text-[1.0625rem] leading-relaxed text-ink">
              No compliance logos, no certification badges, no “bank-grade” adjectives. Below are three lists: what is
              enforced in the database today, where we deliberately drew a line, and what is not true yet.
            </p>
          </div>
          <EnvelopeMark stroke={2} className="hidden h-auto w-full max-w-[14rem] text-plum lg:block" />
        </Shell>
      </section>

      {/* verified */}
      <section className="border-b-2 border-ink">
        <Shell className="py-16 lg:py-24">
          <Reveal>
            <BandHead
              index="01"
              kicker="Verified now"
              title="Enforced in the database, not in the interface."
              lede="Each of these is a rule the server applies. Turning off a screen, calling the API directly or changing the client does not get around them."
            />
            <Rows rows={VERIFIED} />
          </Reveal>
        </Shell>
      </section>

      {/* boundaries */}
      <section className="border-b-2 border-ink bg-plum text-paper">
        <div className="pe-blueprint-invert">
          <Shell className="py-16 lg:py-24">
            <Reveal>
              <BandHead
                index="02"
                kicker="Explicit boundary"
                tone="paper"
                title="Things we chose not to build."
                lede="These are product decisions, not gaps. They are why we can say plainly that Purple Envelope carries the doctor’s standards and approved language into patient conversations, while patient charts and patient-identifying clinical records stay in your practice management software."
              />
              <Rows rows={BOUNDARIES} tone="paper" />
            </Reveal>
          </Shell>
        </div>
      </section>

      {/* not yet */}
      <section className="border-b-2 border-ink bg-paper-2">
        <Shell className="py-16 lg:py-24">
          <Reveal>
            <BandHead
              index="03"
              kicker="Not yet"
              title="The honest list."
              lede="A security page that only contains good news is not a security page. These are open, dated by the version of the product you are looking at, and will change here when they change in the code."
            />
            <Rows rows={LIMITS} />
          </Reveal>
        </Shell>
      </section>

      {/* close */}
      <section>
        <Shell className="py-16 lg:py-20">
          <p className="pe-display max-w-[20ch] text-[clamp(1.8rem,5vw,3.4rem)] text-ink">
            Ask us anything on this page.
          </p>
          <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-ink-soft">
            If a claim here matters to your decision, ask and we will show you the specific rule or test behind it. If
            we cannot, we will remove the claim.
          </p>
          <Link
            to="/start"
            className="pe-focus mt-8 inline-block bg-plum px-8 py-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-plum-deep"
          >
            Request access
          </Link>
        </Shell>
      </section>
    </MarketingLayout>
  );
}
