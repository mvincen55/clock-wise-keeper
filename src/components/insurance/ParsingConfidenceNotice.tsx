/**
 * Honesty about extraction quality. Parsing confidence is tracked per
 * document (and per table); when it isn't high, the reader says so and
 * points at the original page instead of presenting a shaky extraction
 * as the manual.
 */
import { AlertTriangle, FileSearch, ShieldCheck } from 'lucide-react';
import type { ParseConfidence } from '@/lib/manual-parse';

export function ConfidenceBadge({ confidence }: { confidence: ParseConfidence }) {
  const styles: Record<ParseConfidence, string> = {
    high: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/20',
    medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/20',
    low: 'bg-destructive/10 text-destructive ring-destructive/20',
  };
  const labels: Record<ParseConfidence, string> = {
    high: 'High confidence',
    medium: 'Verify against source',
    low: 'Low confidence',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${styles[confidence]}`}
    >
      <ShieldCheck className="h-3 w-3" />
      {labels[confidence]}
    </span>
  );
}

export default function ParsingConfidenceNotice({
  confidence,
  structured,
  onViewOriginal,
}: {
  confidence: ParseConfidence;
  /** False when this is a legacy text extraction shown through heuristics. */
  structured: boolean;
  onViewOriginal: (() => void) | null;
}) {
  if (structured && confidence === 'high') return null;

  const message = !structured
    ? 'This manual was imported before structured parsing existed — sections are a best-effort reading of its text. A manager can re-parse it from the original PDF in Manage manuals.'
    : confidence === 'low'
      ? 'Automatic parsing could not reliably detect this manual’s structure, so navigation is page-based. Use the original PDF as the authoritative view.'
      : 'Formatting may not have been captured accurately everywhere. When wording matters, verify against the original page.';

  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/85">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0">
        <p>{message}</p>
        {onViewOriginal && (
          <button
            type="button"
            onClick={onViewOriginal}
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <FileSearch className="h-3.5 w-3.5" />
            View the original page
          </button>
        )}
      </div>
    </div>
  );
}
