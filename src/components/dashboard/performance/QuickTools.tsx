import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import type { Shortcut } from '../types';

/** The frequent tools, as a compact pill row near the top. Existing routes only. */
export function QuickTools({ tools }: { tools: Shortcut[] }) {
  if (tools.length === 0) return null;
  return (
    <nav aria-label="Quick tools" className="flex flex-wrap gap-2">
      {tools.map(t => (
        <Link
          key={t.id}
          to={t.to}
          title={t.detail}
          className="group inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 text-[12.5px] font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {t.label}
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />
        </Link>
      ))}
    </nav>
  );
}
