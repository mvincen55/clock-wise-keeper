import { MARKETING_ROLES, ROLE_STORIES, useMarketingRole, type MarketingRole } from './roles';
import { cn } from '@/lib/utils';

/**
 * Public-only audience switcher. Changes copy, never permissions.
 * Presentation is an editorial tab strip — rectangular, hard-ruled, no pills.
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
      {!compact && (
        <p className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.22em] text-ink-soft">
          Read this page as
        </p>
      )}
      <div
        role="tablist"
        aria-label="Choose the view that fits your job"
        className={cn(
          'grid border-y-2 border-ink sm:grid-cols-2 lg:grid-cols-4',
          compact && 'border-y',
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
                'pe-focus group -mb-px border-b border-ink/15 px-5 text-left transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:border-r',
                compact ? 'py-2.5' : 'py-5',
                active ? 'bg-plum text-white' : 'bg-transparent text-ink hover:bg-ink/[0.04]',
              )}
            >
              <span
                className={cn(
                  'block font-display font-extrabold uppercase tracking-[-0.01em]',
                  compact ? 'text-[12.5px]' : 'text-[1.05rem]',
                )}
              >
                {r.label}
              </span>
              {!compact && (
                <span
                  className={cn(
                    'mt-1 block font-mono text-[10px] uppercase tracking-[0.16em]',
                    active ? 'text-white/70' : 'text-ink-soft',
                  )}
                >
                  {r.sub}
                </span>
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
      <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <h2 className="pe-display text-[clamp(1.85rem,4.4vw,3.15rem)] text-ink">{story.headline}</h2>
        <p className="max-w-[46ch] self-end text-[1.0625rem] leading-relaxed text-ink-soft">{story.lede}</p>
      </div>

      <ol className="mt-14">
        {story.points.map((p, i) => (
          <li
            key={p.title}
            className="pe-row grid gap-3 py-7 last:border-b last:border-ink/16 lg:grid-cols-[6rem_1fr_1.15fr] lg:gap-10"
          >
            <span className="pe-display text-[2.25rem] leading-none text-plum/35">{`0${i + 1}`}</span>
            <h3 className="pe-display-tight text-[1.2rem] text-ink">{p.title}</h3>
            <p className="max-w-[54ch] text-[14.5px] leading-relaxed text-ink-soft">{p.body}</p>
          </li>
        ))}
      </ol>

      <p className="pe-display-tight mt-12 max-w-[26ch] text-[clamp(1.4rem,3vw,2.1rem)] text-plum">
        {story.recognition}
      </p>
    </div>
  );
}
