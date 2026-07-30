import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import type { WorkStyleQuestion } from '@/lib/work-style-questions';

/**
 * Rank-order question: every option is shown, top = most like you.
 * Arrow buttons instead of drag — it has to work with a thumb on a phone.
 */
export default function RankQuestion({
  question,
  order,
  onChange,
}: {
  question: WorkStyleQuestion;
  order: string[];
  onChange: (next: string[]) => void;
}) {
  const labelFor = (value: string) =>
    question.options.find(o => o.value === value)?.label ?? value;

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{question.prompt}</p>
      <p className="text-xs text-muted-foreground">
        Put them in your order — most like you at the top.
      </p>
      <ul className="space-y-1.5">
        {order.map((value, i) => (
          <li
            key={value}
            className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 font-mono text-xs text-primary">
              {i + 1}
            </span>
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
            <span className="flex-1 leading-snug">{labelFor(value)}</span>
            <div className="flex shrink-0 flex-col">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-7"
                disabled={i === 0}
                aria-label={`Move ${labelFor(value)} up`}
                onClick={() => move(i, -1)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-5 w-7"
                disabled={i === order.length - 1}
                aria-label={`Move ${labelFor(value)} down`}
                onClick={() => move(i, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
