import type { ReactNode } from 'react';
import type { HandbookFormReference as FormReference } from '@/lib/handbook-form-reference';

/** A reference to an existing form, not a replacement submission workflow. */
export default function HandbookFormReference({ form, renderSource, query }: {
  form: FormReference;
  renderSource: (index: number, text?: string) => ReactNode;
  query: string;
}) {
  const matchesFields = !!query.trim() && form.sourceFields.some(({ block }) =>
    ('text' in block ? block.text : block.items.join(' ')).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="handbook-form-reference">
      <div className="handbook-form-instructions">
        <p className="handbook-eyebrow">Before you submit</p>
        {form.instructions.map(instruction => <div key={instruction.index}>{renderSource(instruction.index, instruction.text)}</div>)}
      </div>
      <section className="handbook-form-fields" aria-label="Fields on the original form">
        <p className="handbook-eyebrow">On the original form</p>
        {form.fieldInstructions.map(text => <p key={text}>{text}</p>)}
        <ul>{form.labels.map(label => <li key={label}>{label}</li>)}</ul>
        <p className="handbook-form-help">Ask your office manager for the original Google Doc to complete and submit.</p>
      </section>
      <details className="handbook-form-source" key={query} open={matchesFields || undefined}>
        <summary>View original form text</summary>
        {form.sourceFields.map(({ index }) => <div key={index}>{renderSource(index)}</div>)}
      </details>
    </div>
  );
}
