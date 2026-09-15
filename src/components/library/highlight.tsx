import LiveField from '@/components/handbook/LiveField';
import { escapeRegExp } from '@/lib/doc-library';
import { parseLiveField } from '@/lib/handbook-live-fields';

/** Render text with every occurrence of the query marked. */
export function highlightMatch(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Source-authored HTTP links become anchors and live fields ({{fee D0120 | $65}})
 * become current values; raw HTML and script URLs stay inert text.
 */
export function highlighted(text: string, query: string) {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\{\{[^{}]+\}\})/g).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{highlightMatch(link[1], query)}</a>;
    const field = part.startsWith('{{') ? parseLiveField(part) : null;
    if (field) return <LiveField key={index} field={field} />;
    return <span key={index}>{highlightMatch(part, query)}</span>;
  });
}
