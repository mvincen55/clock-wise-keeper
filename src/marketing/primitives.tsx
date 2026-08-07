import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { EnvelopeMark } from './EnvelopeMark';

/** Scroll-triggered reveal. Falls back to visible when IO is unavailable. */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      data-shown={shown}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn('pe-reveal', className)}
    >
      {children}
    </Tag>
  );
}

/** Small all-caps mono label. Used sparingly — one per band at most. */
export function Eyebrow({
  children,
  className,
  tone = 'plum',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'plum' | 'ink' | 'paper';
}) {
  return (
    <p
      className={cn(
        'font-mono text-[10.5px] uppercase tracking-[0.22em]',
        tone === 'plum' && 'text-plum',
        tone === 'ink' && 'text-ink-soft',
        tone === 'paper' && 'text-paper/55',
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * Band header: an oversized index numeral hard-ruled against a grotesque
 * title. Replaces the old centred eyebrow/serif/lede stack.
 */
export function BandHead({
  index,
  kicker,
  title,
  lede,
  tone = 'ink',
  className,
}: {
  index?: string;
  kicker?: string;
  title: ReactNode;
  lede?: ReactNode;
  tone?: 'ink' | 'paper';
  className?: string;
}) {
  const paper = tone === 'paper';
  return (
    <div className={cn('pe-row-heavy pt-5', paper && 'border-t-paper', className)}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {index && (
          <span
            className={cn(
              'font-mono text-[11px] tabular-nums tracking-[0.2em]',
              paper ? 'text-paper/50' : 'text-plum',
            )}
          >
            {index}
          </span>
        )}
        {kicker && (
          <span
            className={cn(
              'font-mono text-[10.5px] uppercase tracking-[0.22em]',
              paper ? 'text-paper/50' : 'text-ink-soft',
            )}
          >
            {kicker}
          </span>
        )}
      </div>
      <h2
        className={cn(
          'pe-display mt-4 max-w-[18ch] text-[clamp(2rem,5.6vw,4rem)]',
          paper ? 'text-paper' : 'text-ink',
        )}
      >
        {title}
      </h2>
      {lede && (
        <p
          className={cn(
            'mt-5 max-w-[52ch] text-[1.0625rem] leading-relaxed',
            paper ? 'text-paper/70' : 'text-ink-soft',
          )}
        >
          {lede}
        </p>
      )}
    </div>
  );
}

/** Kept for the pages that still compose with it (Features / About / Pricing). */
export function SectionTitle({
  eyebrow,
  title,
  lede,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
      <h2 className="pe-display-tight text-[clamp(1.75rem,3.4vw,2.75rem)] text-ink">{title}</h2>
      {lede && <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-soft">{lede}</p>}
    </div>
  );
}

export function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[84rem] px-5 sm:px-8', className)}>{children}</div>;
}

/** A small honest label used anywhere something is not shipped yet. */
export function StatusTag({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 inline-flex items-center border border-current/30 px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-[0.16em] opacity-70">
      {children}
    </span>
  );
}

type BtnTone = 'plum' | 'ink' | 'paper' | 'ghost';

const BTN_TONES: Record<BtnTone, string> = {
  plum: 'bg-plum text-white hover:bg-plum-deep',
  ink: 'bg-ink text-paper hover:bg-plum-deep',
  paper: 'bg-paper text-ink hover:bg-white',
  ghost: 'border border-ink/25 text-ink hover:border-ink hover:bg-ink hover:text-paper',
};

const BTN_BASE =
  'pe-focus inline-flex items-center justify-center gap-2 rounded-none px-6 py-3.5 font-mono text-[11.5px] uppercase tracking-[0.16em] transition-colors';

/** Rectangular editorial button. No pills anywhere on the public surface. */
export function Btn({
  to,
  href,
  tone = 'plum',
  className,
  children,
  ...rest
}: {
  to?: string;
  href?: string;
  tone?: BtnTone;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = cn(BTN_BASE, BTN_TONES[tone], className);
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function Wordmark({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'paper' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <EnvelopeMark
        stroke={5}
        className={cn('h-[22px] w-[31px]', tone === 'ink' ? 'text-plum' : 'text-paper')}
      />
      <span
        className={cn(
          'font-display text-[13px] font-extrabold uppercase tracking-[0.12em]',
          tone === 'ink' ? 'text-ink' : 'text-paper',
        )}
      >
        Purple Envelope
      </span>
    </span>
  );
}
