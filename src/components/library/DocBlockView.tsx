/**
 * Renders parsed document blocks (see @/lib/doc-format) for the uploaded
 * document readers: headings with section anchors, nested lists, reference
 * tables with live fees, and source-authored links. Shared by the Office
 * Handbook, the Insurance Desk, and the handbook-derived procedures reader.
 */
import { memo } from 'react';
import HandbookFigure from '@/components/handbook/HandbookFigure';
import HandbookList from '@/components/handbook/HandbookList';
import HandbookTemplate from '@/components/handbook/HandbookTemplate';
import HandbookReferenceTable from '@/components/handbook/HandbookReferenceTable';
import HandbookSectionLink from '@/components/handbook/HandbookSectionLink';
import { highlighted } from '@/components/library/highlight';
import type { DocBlock } from '@/lib/doc-format';
import { sectionAnchorId } from '@/lib/doc-library';

// Anchor offset: below the sticky bars when the window scrolls (mobile),
// just inside the pane when the pane scrolls (desktop).
const ANCHOR = 'scroll-mt-28 lg:scroll-mt-6';

// A paragraph that opens with a label the author meant as a callout.
const CALLOUT = /^(Note|Notes|Important|Exception|Reminder|Tip|Tips|Warning|Caution)\s*[:—–-]\s*(.+)$/is;
// A paragraph that is a quoted script, optionally introduced by a short label ("Text message: “…”").
const SCRIPT = /^(?:([A-Z][^:“"]{0,40}):\s*)?[“"](.{20,})[”"]$/s;

const titleCase = (label: string) => label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();

export function BlockView({ block, id, query, number }: { block: DocBlock; id: string; query: string; number?: string }) {
  const render = (text: string) => highlighted(text, query);
  const numbered = number ? <span className="handbook-section-number" aria-hidden="true">{number}</span> : null;
  switch (block.type) {
    case 'heading':
      if (block.level <= 2) {
        return (
          <h2
            id={id}
            tabIndex={-1}
            className={`${ANCHOR} mb-3 mt-10 flex items-center gap-2.5 border-b border-border/70 pb-2 text-xl font-bold tracking-tight text-foreground first:mt-0`}
          >
            {numbered ?? <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-primary/60" />}
            <span className="min-w-0">{render(block.text)}</span>
          </h2>
        );
      }
      if (block.level === 3) {
        return (
          <h3 id={id} tabIndex={-1} className={`${ANCHOR} mb-2 mt-6 text-base font-semibold text-foreground first:mt-0`}>
            {numbered}{render(block.text)}
          </h3>
        );
      }
      return (
        <h4 id={id} tabIndex={-1} className={`${ANCHOR} handbook-subheading mb-1.5 mt-5 text-[15px] font-semibold text-foreground first:mt-0`}>
          {numbered}{render(block.text)}
        </h4>
      );
    case 'table':
      return <HandbookReferenceTable id={id} className={ANCHOR} rows={block.rows} hasHeader={block.hasHeader !== false} renderText={render} />;
    case 'code':
      return <HandbookTemplate id={id} className={ANCHOR} text={block.text} />;
    case 'image':
      return (
        <HandbookFigure
          id={id}
          className={ANCHOR}
          src={block.src}
          alt={block.text}
          caption={block.text ? render(block.text) : null}
        />
      );
    case 'bullets':
    case 'numbered':
      return <HandbookList id={id} className={ANCHOR} items={block.items} depths={block.depths} ordered={block.type === 'numbered'} renderText={render} />;
    default: {
      const callout = block.text.match(CALLOUT);
      if (callout) {
        return (
          <div id={id} className={`${ANCHOR} handbook-callout`} role="note">
            <span className="handbook-callout-label">{titleCase(callout[1])}</span>
            <p>{render(callout[2])}</p>
          </div>
        );
      }
      const script = block.text.match(SCRIPT);
      if (script) {
        return (
          <blockquote id={id} className={`${ANCHOR} handbook-script`}>
            <span className="handbook-script-label">{script[1] ?? 'Suggested wording'}</span>
            <p>{render(script[2])}</p>
          </blockquote>
        );
      }
      return (
        <p id={id} className={`${ANCHOR} mb-4 text-[15px] leading-7 text-foreground/90`}>
          {render(block.text)}
        </p>
      );
    }
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
  numbers,
}: {
  blocks: DocBlock[];
  highlight: string;
  /** Employee handbook path: recognized sections link to their app workflow. */
  handbook?: boolean;
  /** Index of the first block within its document, so anchors stay document-wide. */
  offset?: number;
  /** Policy-book section numbers by document block index (see outlineNumbers). */
  numbers?: Map<number, string>;
}) {
  // Runs of images sit in a grid, like a photo guide, instead of stacking.
  const rendered = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].type === 'image') {
      let end = i;
      while (end < blocks.length && blocks[end].type === 'image') end++;
      const run = blocks.slice(i, end).map((block, j) => (
        <BlockView key={offset + i + j} block={block} id={sectionAnchorId(offset + i + j)} query={highlight} />
      ));
      rendered.push(end - i > 1 ? <div key={`grid-${offset + i}`} className="handbook-figure-grid">{run}</div> : run);
      i = end - 1;
      continue;
    }
    rendered.push(<BlockViewWithLink key={offset + i} block={blocks[i]} id={sectionAnchorId(offset + i)} query={highlight} handbook={handbook} number={numbers?.get(offset + i)} />);
  }
  return <div className="max-w-[46rem]">{rendered}</div>;
});

function BlockViewWithLink({ block, id, query, handbook, number }: { block: DocBlock; id: string; query: string; handbook: boolean; number?: string }) {
  return (
    <>
      <BlockView block={block} id={id} query={query} number={number} />
      {handbook && block.type === 'heading' && <HandbookSectionLink title={block.text} />}
    </>
  );
}
