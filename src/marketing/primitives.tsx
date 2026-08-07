import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

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

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'font-mono text-[11px] uppercase tracking-[0.18em] text-plum/70',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Editorial section heading with a hanging rule. */
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
    <div
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow && <Eyebrow className="mb-4">{eyebrow}</Eyebrow>}
      <h2 className="font-display text-[clamp(1.75rem,3.4vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.015em] text-ink">
        {title}
      </h2>
      {lede && <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-soft">{lede}</p>}
    </div>
  );
}

export function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}

/** A small honest label used anywhere something is not shipped yet. */
export function StatusTag({ children }: { children: ReactNode }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-none border border-line bg-paper-2 px-2 py-0.5 align-middle font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
      {children}
    </span>
  );
}

export function Wordmark({ className, tone = 'ink' }: { className?: string; tone?: 'ink' | 'paper' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className={cn(
          'grid h-7 w-9 place-items-center rounded-[2px] border',
          tone === 'ink'
            ? 'border-plum/25 bg-plum text-paper'
            : 'border-paper/30 bg-paper/10 text-paper',
        )}
      >
        <svg viewBox="0 0 24 16" className="h-3.5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="0.8" y="0.8" width="22.4" height="14.4" rx="1.6" />
          <path d="M1.4 1.8 12 9.4 22.6 1.8" />
        </svg>
      </span>
      <span
        className={cn(
          'font-display text-[1.0625rem] font-semibold tracking-[-0.01em]',
          tone === 'ink' ? 'text-ink' : 'text-paper',
        )}
      >
        Purple Envelope
      </span>
    </span>
  );
}
