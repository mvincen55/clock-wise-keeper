import { cn } from '@/lib/utils';

/**
 * Product compositions for the public site.
 *
 * These are reconstructed in code from the real Purple Envelope interface —
 * same vocabulary, same structures — using invented sample data only. No
 * office, customer, employee or patient information appears here, and no
 * screenshot of a live office is used. Anything not shipped is labelled.
 */

function Frame({
  title,
  meta,
  children,
  className,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(30,20,45,0.05),0_24px_50px_-28px_rgba(40,25,70,0.35)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-2/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-plum/25" />
          <span className="text-[12px] font-medium text-ink">{title}</span>
        </div>
        {meta && <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">{meta}</span>}
      </div>
      <div className="p-4">{children}</div>
      <figcaption className="border-t border-line bg-paper/60 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
        Illustrative interface · sample data
      </figcaption>
    </figure>
  );
}

const dot = 'inline-block h-1.5 w-1.5 rounded-full';

export function AttentionQueueVisual({ className }: { className?: string }) {
  const rows = [
    { label: 'PTO request · 2 days, week of the 14th', who: 'Hygiene', state: 'Needs your approval', tone: 'plum' },
    { label: 'Closing checklist bypassed — reason given', who: 'Front desk', state: 'Review', tone: 'amber' },
    { label: 'New sterilization procedure · v3', who: '4 of 9 read', state: 'In progress', tone: 'muted' },
    { label: 'Punch correction · Tuesday clock-out', who: 'Assisting', state: 'Needs your approval', tone: 'plum' },
  ];
  return (
    <Frame title="Needs attention" meta="Owner view" className={className}>
      <ul className="divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-ink">{r.label}</p>
              <p className="text-[11px] text-ink-soft">{r.who}</p>
            </div>
            <span
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
                r.tone === 'plum' && 'border-plum/25 bg-plum-tint text-plum',
                r.tone === 'amber' && 'border-gold/30 bg-gold/10 text-gold',
                r.tone === 'muted' && 'border-line bg-paper-2 text-ink-soft',
              )}
            >
              <span className={cn(dot, r.tone === 'plum' ? 'bg-plum' : r.tone === 'amber' ? 'bg-gold' : 'bg-ink-soft')} />
              {r.state}
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function AcknowledgmentVisual({ className }: { className?: string }) {
  const people = [
    { tag: 'AV', role: 'Front desk', read: true, when: 'Read v3 · Mon 8:12a' },
    { tag: 'RJ', role: 'Hygiene', read: true, when: 'Read v3 · Mon 1:40p' },
    { tag: 'DM', role: 'Assisting', read: false, when: 'Assigned Mon · due Thu' },
    { tag: 'KT', role: 'Front desk', read: false, when: 'Asked a question · waiting on manager' },
  ];
  return (
    <Frame title="Late cancellation policy · v3" meta="Acknowledgments" className={className}>
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.tag} className="flex items-center gap-3 rounded-lg border border-line/80 px-3 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-plum/10 font-mono text-[11px] font-semibold text-plum">
              {p.tag}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-ink">{p.role}</p>
              <p className="truncate text-[11px] text-ink-soft">{p.when}</p>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]',
                p.read ? 'bg-plum-tint text-plum' : 'bg-paper-2 text-ink-soft',
              )}
            >
              {p.read ? 'Read' : 'Open'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">
        Acknowledgment records receipt of the exact published version. It is not agreement, and nobody signs for
        anyone else.
      </p>
    </Frame>
  );
}

export function CloseTheDayVisual({ className }: { className?: string }) {
  const items = [
    { label: 'Deposit counted and logged', done: true },
    { label: 'Sterilizer log signed', done: true },
    { label: 'Tomorrow’s schedule reviewed', done: true },
    { label: 'Unconfirmed appointments called', done: false },
    { label: 'Operatories turned over', done: false },
  ];
  return (
    <Frame title="Close the Day" meta="Thursday" className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-2xl text-ink">3 of 5</span>
        <span className="font-mono text-[11px] text-ink-soft">4:52 PM ET</span>
      </div>
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-paper-2">
        <div className="h-full w-3/5 rounded-full bg-plum" />
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2.5 text-[13px]">
            <span
              className={cn(
                'grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border',
                i.done ? 'border-plum bg-plum text-white' : 'border-line bg-white',
              )}
            >
              {i.done && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6.5 4.8 9 10 3.4" />
                </svg>
              )}
            </span>
            <span className={i.done ? 'text-ink-soft line-through decoration-line' : 'text-ink'}>{i.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 rounded-md border border-gold/25 bg-gold/8 px-3 py-2 text-[11px] leading-relaxed text-ink-soft">
        A checklist can gate clock-out, but it never traps anyone at work. A bypass takes a short reason and creates
        follow-up.
      </p>
    </Frame>
  );
}

export function KnowledgeVisual({ className }: { className?: string }) {
  const docs = [
    { name: 'New patient phone flow', state: 'Published', v: 'v4' },
    { name: 'Insurance breakdown checklist', state: 'Published', v: 'v2' },
    { name: 'Emergency same-day protocol', state: 'In review', v: 'draft' },
    { name: 'Opening duties — front', state: 'Published', v: 'v7' },
  ];
  return (
    <Frame title="Office knowledge" meta="Handbook & procedures" className={className}>
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-ink-soft" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <span className="text-[12.5px] text-ink-soft">Search the handbook…</span>
      </div>
      <ul className="divide-y divide-line/70">
        {docs.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 py-2.5">
            <span className="truncate text-[13px] text-ink">{d.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[10px] text-ink-soft">{d.v}</span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]',
                  d.state === 'Published' ? 'bg-plum-tint text-plum' : 'bg-paper-2 text-ink-soft',
                )}
              >
                {d.state}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function TrainingVisual({ className }: { className?: string }) {
  return (
    <Frame title="Training" meta="Assigned to you" className={className}>
      <ul className="space-y-2.5">
        {[
          { name: 'Handling a late cancellation call', pct: 100 },
          { name: 'Presenting a treatment estimate', pct: 60 },
          { name: 'Sterilization: instrument cycle', pct: 0 },
        ].map((m) => (
          <li key={m.name} className="rounded-lg border border-line/80 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[13px] text-ink">{m.name}</span>
              <span className="font-mono text-[11px] text-ink-soft">{m.pct}%</span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-paper-2">
              <div className="h-full rounded-full bg-plum" style={{ width: `${Math.max(m.pct, 2)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export function RequestStatusVisual({ className }: { className?: string }) {
  const steps = [
    { label: 'Submitted', done: true, when: 'Mon 9:04a' },
    { label: 'Seen by manager', done: true, when: 'Mon 11:20a' },
    { label: 'Approved', done: false, when: 'Waiting' },
  ];
  return (
    <Frame title="Time off · Mar 14–15" meta="My requests" className={className}>
      <ol className="relative space-y-4 pl-5">
        <span className="absolute left-[6px] top-2 bottom-2 w-px bg-line" aria-hidden />
        {steps.map((s) => (
          <li key={s.label} className="relative">
            <span
              className={cn(
                'absolute -left-5 top-1 h-3 w-3 rounded-full border-2 bg-white',
                s.done ? 'border-plum' : 'border-line',
              )}
            />
            <p className={cn('text-[13px]', s.done ? 'text-ink' : 'text-ink-soft')}>{s.label}</p>
            <p className="font-mono text-[10.5px] text-ink-soft">{s.when}</p>
          </li>
        ))}
      </ol>
    </Frame>
  );
}
