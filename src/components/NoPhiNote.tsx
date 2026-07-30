import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The standing reminder above anything that reaches an AI service.
 *
 * The office is bound by HIPAA; the AI gateway is not inside that agreement.
 * The server scrubs person-level text as a backstop, but the honest fix is
 * that nobody types it in the first place — so we say so, every time, plainly
 * and without scolding.
 */
export default function NoPhiNote({
  what = 'What you type here',
  className,
}: {
  /** What is being sent, e.g. "This file" — keeps the sentence natural. */
  what?: string;
  className?: string;
}) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}>
      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {what} goes to an AI service outside the practice. Keep it about the work — never a
        patient's name, chart number, or clinical detail.
      </span>
    </p>
  );
}
