import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** The currency marker is presentation only; values remain decimal strings. */
export const CurrencyInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, placeholder = '0.00', ...props }, ref) => (
    <div className="relative min-w-0 w-full">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
      <Input ref={ref} inputMode="decimal" placeholder={placeholder} {...props} className={cn('pl-7', className)} />
    </div>
  ),
);
CurrencyInput.displayName = 'CurrencyInput';
