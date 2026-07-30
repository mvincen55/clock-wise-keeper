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
 * Quiet coaching, never a gate: five small chips showing how the polished goal
 * meets each SMART element — or a gentle nudge where one is thin.
 */
export default function SmartChips({ smart }: { smart: SmartRead }) {
  const shown = ELEMENTS.filter(e => smart[e.key]?.trim());
  if (!shown.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map(e => (
        <Badge
          key={e.key}
          variant="secondary"
          title={e.label}
          className="max-w-full whitespace-normal text-left font-normal"
        >
          <span className="mr-1 font-semibold text-primary">{e.letter}:</span>
          {smart[e.key]}
        </Badge>
      ))}
    </div>
  );
}
