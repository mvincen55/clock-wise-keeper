import { Badge } from '@/components/ui/badge';

export type SmartRead = {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  time_bound: string;
};

const ELEMENTS: { key: keyof SmartRead; letter: string; label: string }[] = [
  { key: 'specific', letter: 'S', label: 'Specific' },
  { key: 'measurable', letter: 'M', label: 'Measurable' },
  { key: 'achievable', letter: 'A', label: 'Achievable' },
  { key: 'relevant', letter: 'R', label: 'Relevant' },
  { key: 'time_bound', letter: 'T', label: 'Time-bound' },
];

/**
 * Quiet coaching: five small chips showing how the polished goal meets each
 * SMART element. Specific and Measurable are the two that gate saving, so a
 * plain hint sits next to whichever of those still needs work.
 */
export default function SmartChips({
  smart,
  hintFor,
  hint,
}: {
  smart: SmartRead;
  hintFor?: 'specific' | 'measurable' | null;
  hint?: string | null;
}) {
  const shown = ELEMENTS.filter(e => smart[e.key]?.trim() || e.key === hintFor);
  if (!shown.length) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {shown.map(e => (
          <Badge
            key={e.key}
            variant="secondary"
            title={e.label}
            className="max-w-full whitespace-normal text-left font-normal"
          >
            <span className="mr-1 font-semibold text-primary">{e.letter}:</span>
            {smart[e.key]?.trim() || e.label}
          </Badge>
        ))}
      </div>
      {hintFor && hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
