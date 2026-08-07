import { Fragment } from 'react';
import { parseLetterBody, type LetterRun } from '@/lib/letters/letter-body';

/**
 * Renders letter-markup text as printable paragraphs/lists. The parser only
 * emits known structures (src/lib/letters/letter-body.ts), so office wording
 * can never inject markup into a printed letter.
 */

function Runs({ runs }: { runs: LetterRun[] }) {
  return (
    <>
      {runs.map((run, i) => {
        let node: React.ReactNode = run.text;
        if (run.italic) node = <em>{node}</em>;
        if (run.bold) node = <strong>{node}</strong>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

export default function LetterBodyContent({ markup }: { markup: string }) {
  const blocks = parseLetterBody(markup);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind;
          return (
            <List key={i} className="letter-list">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Runs runs={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i} style={block.align !== 'left' ? { textAlign: block.align } : undefined}>
            <Runs runs={block.runs} />
          </p>
        );
      })}
    </>
  );
}
