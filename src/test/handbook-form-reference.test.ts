import { describe, expect, it } from 'vitest';
import { handbookFormReference } from '@/lib/handbook-form-reference';
import type { DocBlock } from '@/lib/doc-format';

const blocks: DocBlock[] = [
  { type: 'heading', level: 3, text: 'Time Off Request Form' },
  { type: 'para', text: 'Form is located in google docs.' },
  { type: 'para', text: 'Submit the original form to the office manager.' },
  { type: 'para', text: 'Employee Name Time off Start Date Return to Work Date Total Time Off' },
  { type: 'para', text: 'Days & Hours Off Type of Leave Reason for Leave Employee Signature Approvals' },
  { type: 'heading', level: 3, text: 'Next policy' },
];

describe('flattened handbook form presentation', () => {
  it('separates instructions and fields without changing the source blocks', () => {
    const before = JSON.stringify(blocks);
    const result = handbookFormReference(blocks, 0)!;
    expect(result.end).toBe(5);
    expect(result.instructions.map(row => row.text)).toEqual(['Form is located in google docs.', 'Submit the original form to the office manager.']);
    expect(result.labels).toEqual(['Employee Name', 'Time off Start Date', 'Return to Work Date', 'Total Time Off', 'Days & Hours Off', 'Type of Leave', 'Reason for Leave', 'Employee Signature', 'Approvals']);
    expect(result.sourceFields.map(row => row.index)).toEqual([3, 4]);
    expect(JSON.stringify(blocks)).toBe(before);
  });
  it('does not interpret unrelated sections or incomplete forms', () => {
    expect(handbookFormReference([{ ...blocks[0], text: 'Another form' } as DocBlock, ...blocks.slice(1)], 0)).toBeNull();
    expect(handbookFormReference(blocks.slice(0, 4), 0)).toBeNull();
  });
});
