/**
 * Renders parsed document blocks (see @/lib/doc-format) for the uploaded
 * document readers: headings with section anchors, nested lists, reference
 * tables with live fees, and source-authored links. Shared by the Office
 * Handbook, the Insurance Desk, and the handbook-derived procedures reader.
 */
import { memo } from 'react';
import HandbookList from '@/components/handbook/HandbookList';
import HandbookReferenceTable from '@/components/handbook/HandbookReferenceTable';
import HandbookSectionLink from '@/components/handbook/HandbookSectionLink';
import { highlighted } from '@/components/library/highlight';
import type { DocBlock } from '@/lib/doc-format';
import { sectionAnchorId } from '@/lib/doc-library';

// Anchor offset: below the sticky bars when the window scrolls (mobile),
// just inside the pane when the pane scrolls (desktop).
const ANCHOR = 'scroll-mt-28 lg:scroll-mt-6';

export function BlockView({ block, id, query }: { block: DocBlock; id: string; query: string }) {
  const render = (text: string) => highlighted(text, query);
  switch (block.type) {
    case 'heading':
      if (block.level <= 2) {
        return (
          <h2
            id={id}
            tabIndex={-1}
            className={`${ANCHOR} mb-3 mt-10 flex items-center gap-2.5 border-b border-border/70 pb-2 text-xl font-bold tracking-tight text-foreground first:mt-0`}
          >
            <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-primary/60" />
            <span className="min-w-0">{render(block.text)}</span>
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3 id={id} tabIndex={-1} className={`${ANCHOR} mb-2 mt-6 text-base font-semibold text-foreground first:mt-0`}>
            {render(block.text)}
          </h3>
        );
      }
      return (
        <h4 id={id} tabIndex={-1} className={`${ANCHOR} handbook-subheading mb-1.5 mt-5 text-[15px] font-semibold text-foreground first:mt-0`}>
          {render(block.text)}
        </h4>
      );
    case 'table':
      return <HandbookReferenceTable id={id} className={ANCHOR} rows={block.rows} hasHeader={block.hasHeader !== false} renderText={render} />;
    case 'bullets':
    case 'numbered':
      return <HandbookList id={id} className={ANCHOR} items={block.items} depths={block.depths} ordered={block.type === 'numbered'} renderText={render} />;
    default:
      return (
        <p id={id} className={`${ANCHOR} mb-4 text-[15px] leading-7 text-foreground/90`}>
          {render(block.text)}
        </p>
      );
  }
}

/**
 * The document body, memoized hard: scrollspy state changes many times per
 * scroll, and re-rendering a 67-section handbook on every tick is exactly
 * the jank this avoids.
 */
export const ReaderBody = memo(function ReaderBody({
  blocks,
  highlight,
  handbook = false,
  offset = 0,
}: {
  blocks: DocBlock[];
  highlight: string;
  /** Employee handbook path: recognized sections link to their app workflow. */
  handbook?: boolean;
  /** Index of the first block within its document, so anchors stay document-wide. */
  offset?: number;
}) {
  return (
    <div className="max-w-[46rem]">
      {blocks.map((block, i) => (
        <BlockViewWithLink key={offset + i} block={block} id={sectionAnchorId(offset + i)} query={highlight} handbook={handbook} />
      ))}
    </div>
  );
});

function BlockViewWithLink({ block, id, query, handbook }: { block: DocBlock; id: string; query: string; handbook: boolean }) {
  return (
    <>
      <BlockView block={block} id={id} query={query} />
      {handbook && block.type === 'heading' && <HandbookSectionLink title={block.text} />}
    </>
  );
}
