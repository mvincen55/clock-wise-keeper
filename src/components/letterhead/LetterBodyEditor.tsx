import { useRef } from 'react';
import { AlignCenter, Bold, Braces, Italic, List, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  insertText,
  toggleAlign,
  toggleList,
  wrapSelection,
  type EditRange,
} from '@/lib/letters/editor-ops';
import { LETTER_PLACEHOLDERS } from '@/lib/letters/letter-body';

/**
 * The letter body editor — a plain textarea over letter-markup with a small
 * formatting toolbar (word processor lite, on purpose). Formatting lands as
 * markers the shared parser understands (**bold**, _italic_, "- " lists,
 * "::center"), so the on-screen preview and the printed page are always the
 * same rendering. Optional placeholder chips insert the safe template
 * variables for reusable letters.
 */

export default function LetterBodyEditor({
  value,
  onChange,
  rows = 14,
  showPlaceholders = false,
  ariaLabel = 'Letter body',
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  /** Offer the {{placeholder}} chips (template editing surfaces). */
  showPlaceholders?: boolean;
  ariaLabel?: string;
}) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  const apply = (transform: (r: EditRange) => EditRange) => {
    const el = areaRef.current;
    const range: EditRange = el
      ? { value, start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length }
      : { value, start: value.length, end: value.length };
    const next = transform(range);
    onChange(next.value);
    requestAnimationFrame(() => {
      if (!areaRef.current) return;
      areaRef.current.focus();
      areaRef.current.setSelectionRange(next.start, next.end);
    });
  };

  const tools = [
    { label: 'Bold', icon: Bold, run: () => apply(r => wrapSelection(r, '**')) },
    { label: 'Italic', icon: Italic, run: () => apply(r => wrapSelection(r, '_')) },
    { label: 'Bulleted list', icon: List, run: () => apply(r => toggleList(r, 'ul')) },
    { label: 'Numbered list', icon: ListOrdered, run: () => apply(r => toggleList(r, 'ol')) },
    { label: 'Center paragraph', icon: AlignCenter, run: () => apply(r => toggleAlign(r, 'center')) },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formatting">
        {tools.map(tool => (
          <Button
            key={tool.label}
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 touch-target"
            aria-label={tool.label}
            title={tool.label}
            onClick={tool.run}
          >
            <tool.icon className="h-4 w-4" />
          </Button>
        ))}
        {showPlaceholders && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8">
                <Braces className="mr-1.5 h-3.5 w-3.5" />
                Placeholder
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {LETTER_PLACEHOLDERS.map(key => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => apply(r => insertText(r, `{{${key}}}`))}
                  className="font-mono text-xs"
                >
                  {`{{${key}}}`}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <Textarea
        ref={areaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        aria-label={ariaLabel}
        placeholder={'Write the letter…\n\nBlank line = new paragraph. Use the toolbar for bold, italics, and lists.'}
        className="font-normal leading-relaxed"
      />
    </div>
  );
}
