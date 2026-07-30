import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ListPlus, Check } from 'lucide-react';
import { getToday } from '@/lib/time-utils';
import { useProposeCapture, useConfirmCapture } from '@/hooks/useCopilot';

/**
 * One-tap capture from any AI surface (brief, nudge, sprint, goal plan,
 * training follow-up). The tap IS the confirmation — nothing is added on the
 * member's behalf before it.
 */
export function AddToMyListButton({
  surface,
  title,
  firstStep,
  dueDate,
  label = 'Add to my list',
  size = 'sm',
  variant = 'outline',
}: {
  surface: string;
  title: string;
  firstStep?: string | null;
  dueDate?: string | null;
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'secondary';
}) {
  const propose = useProposeCapture();
  const confirm = useConfirmCapture();
  const [added, setAdded] = useState(false);
  const busy = propose.isPending || confirm.isPending;

  const onClick = async () => {
    const proposal = await propose.mutateAsync({
      surface,
      title,
      firstStep,
      dueDate: dueDate ?? getToday(),
    });
    if (!proposal) {
      // Already offered once — stay quiet rather than repeating ourselves.
      setAdded(true);
      return;
    }
    await confirm.mutateAsync(proposal);
    setAdded(true);
  };

  if (added) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-primary" /> On your list
      </span>
    );
  }

  return (
    <Button size={size} variant={variant} disabled={busy} onClick={onClick}>
      <ListPlus className="h-3.5 w-3.5 mr-1" /> {label}
    </Button>
  );
}

export default AddToMyListButton;
