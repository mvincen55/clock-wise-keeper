import type { DocBlock } from '@/lib/doc-format';

export interface HandbookFormReference {
  end: number;
  instructions: Array<{ index: number; text: string }>;
  sourceFields: Array<{ index: number; block: DocBlock }>;
  labels: string[];
  fieldInstructions: string[];
}

/** Presentation only: recognize a flattened form, never rewrite stored text.
 * Fail closed when the field boundary is ambiguous. Other sections are untouched.
 */
export function handbookFormReference(blocks: DocBlock[], headingIndex: number): HandbookFormReference | null {
  const heading = blocks[headingIndex];
  if (heading?.type !== 'heading' || !/^time off request form$/i.test(heading.text.trim())) return null;
  let end = headingIndex + 1;
  while (end < blocks.length && blocks[end].type !== 'heading') end++;
  const fieldIndex = blocks.findIndex((block, index) => index > headingIndex && index < end && block.type === 'para' && /^Employee Name\b/.test(block.text));
  if (fieldIndex < 0 || blocks.slice(headingIndex + 1, fieldIndex).some(block => block.type !== 'para')) return null;
  const sourceFields = blocks.slice(fieldIndex, end).map((block, offset) => ({ index: fieldIndex + offset, block }));
  const source = sourceFields.map(({ block }) => 'text' in block ? block.text : block.items.join(' ')).join(' ');
  if (!/Employee Signature/.test(source) || !/Return to Work Date/.test(source)) return null;
  const labels = ['Employee Name', 'Time off Start Date', 'Return to Work Date', 'Total Time Off', 'Days & Hours Off', 'Type of Leave', 'Reason for Leave', 'Employee Signature', 'Approvals'].filter(label => source.includes(label));
  return {
    end,
    instructions: blocks.slice(headingIndex + 1, fieldIndex).flatMap((block, offset) => block.type === 'para' ? [{ index: headingIndex + 1 + offset, text: block.text.replace(/^Time Off Request Form\s+(?=This form\b)/i, '') }] : []),
    sourceFields,
    labels,
    fieldInstructions: source.match(/Please check only 1[^.]*\.|Please list the dates[^.]*\./g) ?? [],
  };
}
