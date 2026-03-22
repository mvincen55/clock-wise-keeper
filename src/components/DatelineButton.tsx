import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';
import { format } from 'date-fns';

interface DatelineButtonProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInsert: (newValue: string) => void;
}

export function DatelineButton({ textareaRef, onInsert }: DatelineButtonProps) {
  const handleInsert = () => {
    const ta = textareaRef.current;
    if (!ta) return;

    const dateline = `- - ${format(new Date(), 'EEE MMM dd, yyyy')} - -`;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
    const newValue = `${before}${prefix}${dateline}${suffix}${after}`;
    onInsert(newValue);

    // Restore focus and cursor
    requestAnimationFrame(() => {
      const cursorPos = before.length + prefix.length + dateline.length + suffix.length;
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
      onClick={handleInsert}
      title="Insert dateline"
    >
      <CalendarClock className="h-3.5 w-3.5" />
      Dateline
    </Button>
  );
}
