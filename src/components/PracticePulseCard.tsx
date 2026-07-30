import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronDown, Check, AlertTriangle, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePracticePulse, pulseLabel, type PulseLevel } from '@/hooks/usePracticePulse';
import { usePrefersReducedMotion } from '@/lib/motion';
import WaxSeal from '@/components/WaxSeal';

const ORB: Record<PulseLevel, { ring: string; core: string; text: string }> = {
  healthy: {
    ring: 'hsl(var(--success))',
    core: 'hsl(var(--success) / 0.18)',
    text: 'text-success',
  },
  watch: {
    ring: 'hsl(var(--warning))',
    core: 'hsl(var(--warning) / 0.18)',
    text: 'text-warning',
  },
  attention: {
    ring: 'hsl(var(--destructive))',
    core: 'hsl(var(--destructive) / 0.18)',
    text: 'text-destructive',
  },
};

const SIGNAL_ICON: Record<PulseLevel, typeof Check> = {
  healthy: Check,
  watch: AlertTriangle,
  attention: CircleAlert,
};

/**
 * The office's health right now, as a slowly breathing orb. Tapping it opens
 * the signals that produced the state — no score, no hidden weighting.
 * When the month's collections target is met the orb takes a one-second
 * wax-seal state, once per month, for every role.
 */
export default function PracticePulseCard() {
  const { data } = usePracticePulse();
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [seal, setSeal] = useState(false);

  const monthKey = data?.monthKey;
  const targetMet = data?.targetMet;

  useEffect(() => {
    if (!targetMet || !monthKey) return;
    const key = `pe_seal_${monthKey}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    setSeal(true);
  }, [targetMet, monthKey]);

  if (!data) return null;

  const tone = ORB[data.level];
  const counts = {
    watch: data.signals.filter(s => s.level === 'watch').length,
    attention: data.signals.filter(s => s.level === 'attention').length,
  };

  const summary =
    data.level === 'healthy'
      ? 'Everything reads normal right now.'
      : `${counts.attention + counts.watch} signal${
          counts.attention + counts.watch === 1 ? '' : 's'
        } worth a look.`;

  return (
    <Card className="card-elevated paper-surface relative overflow-hidden">
      <WaxSeal show={seal} onDone={() => setSeal(false)} caption="Monthly target sealed" />
      <CardContent className="p-5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-4 text-left"
        >
          <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <span
              className={cn('absolute inset-0 rounded-full', !reduced && 'pulse-breathe')}
              style={{
                background: tone.core,
                boxShadow: `0 0 0 1px ${tone.ring}, 0 0 24px ${tone.core}`,
                transition: 'background 900ms ease, box-shadow 900ms ease',
              }}
            />
            <span
              className="h-6 w-6 rounded-full"
              style={{ background: tone.ring, transition: 'background 900ms ease' }}
            />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-xs uppercase tracking-wide text-muted-foreground">
              Practice pulse
            </span>
            <span className={cn('block text-lg font-semibold', tone.text)}>
              {pulseLabel(data.level)}
            </span>
            <span className="block text-xs text-muted-foreground">{summary}</span>
          </span>

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>

        {open && (
          <ul className={cn('mt-4 space-y-2 border-t pt-4', !reduced && 'reveal-soft')}>
            {data.signals.map(s => {
              const Icon = SIGNAL_ICON[s.level];
              return (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ORB[s.level].text)} />
                  <span className="min-w-0">
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.detail}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
