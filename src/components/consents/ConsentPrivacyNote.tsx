import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The standing privacy line for Forms & Consents surfaces: patient details
 * typed here are temporary, printed, and cleared — never stored. Shown
 * wherever temporary patient information is entered or previewed.
 */
export function ConsentPrivacyNote({ text, className }: { text: string; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}>
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
