import { describe, expect, it } from 'vitest';
import { parseDocBlocks } from '@/lib/doc-format';

describe('table cells that hold live fields', () => {
  it('keeps the bar inside {{ … | … }} from splitting the row', () => {
    const blocks = parseDocBlocks(
      [
        '| Event code | Description |',
        '| --- | --- |',
        '| 9100 | No-show. {{setting broken_appointments.fee | $75}} fee. |',
        '| 9102 | Rescheduled with notice. No fee. |',
      ].join('\n')
    );
    expect(blocks).toHaveLength(1);
    const table = blocks[0];
    expect(table.type).toBe('table');
    if (table.type !== 'table') return;
    expect(table.rows).toEqual([
      ['Event code', 'Description'],
      ['9100', 'No-show. {{setting broken_appointments.fee | $75}} fee.'],
      ['9102', 'Rescheduled with notice. No fee.'],
    ]);
    // The rebuilt markdown keeps the token intact for search text.
    expect(table.text).toContain('{{setting broken_appointments.fee | $75}}');
    expect(table.text).not.toContain('\\|');
  });

  it('still honours an escaped pipe inside a cell', () => {
    const blocks = parseDocBlocks(['| A | B |', '| --- | --- |', '| x \\| y | z |'].join('\n'));
    expect(blocks[0].type === 'table' && blocks[0].rows[1]).toEqual(['x | y', 'z']);
  });
});
