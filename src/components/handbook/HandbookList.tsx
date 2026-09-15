import type { ReactNode } from 'react';

interface ListNode {
  text: string;
  children: ListNode[];
}

/** Nest flat items by their parsed depth (see DocBlock depths). */
function listTree(items: string[], depths?: number[]): ListNode[] {
  const roots: ListNode[] = [];
  const stack: { node: ListNode; depth: number }[] = [];
  items.forEach((text, index) => {
    const depth = depths?.[index] ?? 0;
    const node: ListNode = { text, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].node.children.push(node);
    stack.push({ node, depth });
  });
  return roots;
}

const TOP: Record<'ul' | 'ol', string> = {
  ul: 'mb-4 list-disc space-y-1.5 pl-5 text-[15px] leading-7 marker:text-primary/50',
  ol: 'mb-4 list-decimal space-y-1.5 pl-5 text-[15px] leading-7 marker:font-medium marker:text-primary/70',
};
const NESTED: Record<'ul' | 'ol', string> = {
  ul: 'mt-1.5 list-[circle] space-y-1 pl-5 marker:text-primary/40',
  ol: 'mt-1.5 list-[lower-alpha] space-y-1 pl-5 marker:text-primary/60',
};

/**
 * A document list with real nesting: sub-steps sit under their step instead
 * of flattening into one run, and a multi-line item keeps its line breaks.
 */
export default function HandbookList({
  id,
  className = '',
  items,
  depths,
  ordered,
  renderText = text => text,
}: {
  id?: string;
  className?: string;
  items: string[];
  depths?: number[];
  ordered: boolean;
  renderText?: (text: string) => ReactNode;
}) {
  const Tag = ordered ? 'ol' : 'ul';
  const render = (nodes: ListNode[], level: number): ReactNode => (
    <Tag id={level === 0 ? id : undefined} className={level === 0 ? `${className} ${TOP[Tag]}` : NESTED[Tag]}>
      {nodes.map((node, index) => (
        <li key={index} className={node.text.includes('\n') ? 'whitespace-pre-line' : undefined}>
          {renderText(node.text)}
          {node.children.length > 0 && render(node.children, level + 1)}
        </li>
      ))}
    </Tag>
  );
  return <>{render(listTree(items, depths), 0)}</>;
}
