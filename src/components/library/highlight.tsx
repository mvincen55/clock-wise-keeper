import { escapeRegExp } from '@/lib/doc-library';

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

/** Source-authored HTTP links only; raw HTML and script URLs stay inert text. */
export function highlighted(text: string, query: string) {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    return link ? <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{highlightMatch(link[1], query)}</a> : <span key={index}>{highlightMatch(part, query)}</span>;
  });
}
