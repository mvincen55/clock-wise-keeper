import { MARKETING_ROLES, ROLE_STORIES, useMarketingRole, type MarketingRole } from './roles';
import { cn } from '@/lib/utils';
import { Eyebrow } from './primitives';

/**
 * Public-only audience switcher. Changes copy, never permissions.
 */
export default function RoleSelector({
  compact = false,
  onChange,
}: {
  compact?: boolean;
  onChange?: (role: MarketingRole) => void;
}) {
  const [role, setRole] = useMarketingRole();

  return (
    <div>
      {!compact && <Eyebrow className="mb-3">Show me Purple Envelope for…</Eyebrow>}
      <div
        role="tablist"
        aria-label="Choose the view that fits your job"
        className={cn(
          'flex flex-wrap gap-2',
          compact && 'gap-1.5',
        )}
      >
        {MARKETING_ROLES.map((r) => {
          const active = r.id === role;
          return (
            <button
              key={r.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                setRole(r.id);
                onChange?.(r.id);
              }}
              className={cn(
                'group rounded-none border px-4 text-left transition-all duration-200',
                compact ? 'py-1.5' : 'py-2.5',
                active
                  ? 'border-plum bg-plum text-white shadow-[0_10px_24px_-14px_rgba(83,64,110,0.9)]'
                  : 'border-line bg-white/70 text-ink hover:border-plum/40 hover:bg-white',
              )}
            >
              <span className={cn('block font-medium', compact ? 'text-[12.5px]' : 'text-[13.5px]')}>{r.label}</span>
              {!compact && (
                <span className={cn('block text-[11.5px]', active ? 'text-white/70' : 'text-ink-soft')}>{r.sub}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RoleStoryBlock() {
  const [role] = useMarketingRole();
  const story = ROLE_STORIES[role];

  return (
    <div key={role} className="animate-pe-fade-up">
      <h2 className="max-w-3xl font-display text-[clamp(1.6rem,3.2vw,2.5rem)] font-medium leading-[1.12] tracking-[-0.015em] text-ink">
        {story.headline}
      </h2>
      <p className="mt-4 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">{story.lede}</p>
      <ol className="mt-10 grid gap-px overflow-hidden rounded-none border border-line bg-line md:grid-cols-3">
        {story.points.map((p, i) => (
          <li key={p.title} className="bg-paper p-6">
            <span className="font-mono text-[11px] text-plum/60">0{i + 1}</span>
            <h3 className="mt-2 font-display text-[1.15rem] font-medium leading-snug text-ink">{p.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{p.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 border-l-2 border-plum/40 pl-5 font-display text-[1.15rem] italic leading-snug text-ink">
        {story.recognition}
      </p>
    </div>
  );
}
