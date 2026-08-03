/**
 * Hierarchical table of contents for a carrier manual.
 *
 * Real detected sections only — headers, footers, addresses, and TOC rows
 * never reach this list (the parser types them out). Top-level groups
 * with children collapse; the active section is marked and kept visible
 * by adjusting only this list's own scrollTop (never scrollIntoView,
 * which can yank the reading pane). A filter field narrows long manuals.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { ManualSection } from '@/lib/manual-parse';

interface TocNode {
  section: ManualSection;
  children: TocNode[];
}

function buildTree(sections: ManualSection[]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const section of sections) {
    const node: TocNode = { section, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].section.level >= section.level) {
      stack.pop();
    }
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return roots;
}

export default function ManualTableOfContents({
  sections,
  activeSectionId,
  showPages,
  onJump,
}: {
  sections: ManualSection[];
  activeSectionId: string;
  /** Show source page numbers next to sections (structured parses only). */
  showPages: boolean;
  onJump: (section: ManualSection) => void;
}) {
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => buildTree(sections), [sections]);
  const filtering = filter.trim().length > 0;
  const filterLower = filter.trim().toLowerCase();

  // Keep the active row visible by moving ONLY this list's scrollTop.
  useEffect(() => {
    const box = listRef.current;
    if (!box || !activeSectionId || box.scrollHeight <= box.clientHeight) return;
    const el = box.querySelector<HTMLElement>(`[data-toc-id="${CSS.escape(activeSectionId)}"]`);
    if (!el) return;
    const boxRect = box.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < boxRect.top + 8 || elRect.bottom > boxRect.bottom - 8) {
      box.scrollTop += elRect.top - boxRect.top - box.clientHeight / 2 + el.clientHeight / 2;
    }
  }, [activeSectionId]);

  if (sections.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-muted-foreground">
        No sections detected in this manual.
      </p>
    );
  }

  const matches = (node: TocNode): boolean =>
    node.section.title.toLowerCase().includes(filterLower) || node.children.some(matches);

  const renderNode = (node: TocNode, depth: number) => {
    if (filtering && !matches(node)) return null;
    const { section } = node;
    const active = section.id === activeSectionId;
    const hasChildren = node.children.length > 0;
    const isCollapsed = !filtering && collapsed.has(section.id);
    // The active section's ancestors stay expanded so context is never lost.
    const containsActive = (n: TocNode): boolean =>
      n.section.id === activeSectionId || n.children.some(containsActive);
    const effectiveCollapsed = isCollapsed && !containsActive(node);

    return (
      <div key={section.id}>
        <div
          className={`group flex items-center gap-1 rounded-md border-l-2 pr-1.5 transition-colors ${
            active
              ? 'border-primary bg-primary/10'
              : 'border-transparent hover:bg-muted'
          }`}
          style={{ paddingLeft: depth > 0 ? depth * 12 : 0 }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={effectiveCollapsed ? 'Expand group' : 'Collapse group'}
              onClick={() =>
                setCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                })
              }
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              {effectiveCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            data-toc-id={section.id}
            onClick={() => onJump(section)}
            className={`flex min-w-0 flex-1 items-baseline gap-2 py-1.5 text-left text-[13px] leading-snug ${
              active ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="min-w-0 flex-1">{section.title}</span>
            {showPages && section.page > 0 && (
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                p.{section.page}
              </span>
            )}
          </button>
        </div>
        {hasChildren && !effectiveCollapsed && (
          <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative shrink-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter sections…"
          className="h-8 rounded-lg pl-8 text-xs focus-visible:ring-primary"
        />
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-0.5 overscroll-contain pr-1 lg:overflow-y-auto"
      >
        {tree.map(node => renderNode(node, 0))}
        {filtering && tree.every(n => !matches(n)) && (
          <p className="px-2 py-1 text-xs text-muted-foreground">No section matches.</p>
        )}
      </div>
    </div>
  );
}
