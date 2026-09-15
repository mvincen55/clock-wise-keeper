import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { HandbookLiveProvider } from '@/components/handbook/HandbookLiveContext';
import { BlockView, ReaderBody } from '@/components/library/DocBlockView';
import { parseDocBlocks } from '@/lib/doc-format';
import { parseLiveField, resolveLiveField, splitLiveFields, stripLiveFields } from '@/lib/handbook-live-fields';

// Synthetic values only.
const state = vi.hoisted(() => ({
  fees: { scheduleName: 'Office Fee Schedule', byCode: new Map([['D0120', 6500], ['4002', 4400], ['D4341', 33800], ['D4342', 26400]]) } as { scheduleName: string; byCode: Map<string, number> } | null,
  settings: { feeAmount: 75, noticeBusinessHours: 48, vipPrepayFloor: 150, historyWindowYears: 5 } as { feeAmount: number; noticeBusinessHours: number; vipPrepayFloor: number; historyWindowYears: number } | null,
}));
vi.mock('@/hooks/useOfficeFeeLookup', () => ({ useOfficeFeeLookup: () => ({ data: state.fees }) }));
vi.mock('@/hooks/useBrokenApptSettings', () => ({ useBrokenApptSettings: () => ({ data: state.settings }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: 'employee' } }) }));

afterEach(() => { cleanup(); state.fees = { scheduleName: 'Office Fee Schedule', byCode: new Map([['D0120', 6500], ['4002', 4400], ['D4341', 33800], ['D4342', 26400]]) }; });

describe('live field syntax', () => {
  it('parses fee and setting fields with fallbacks and rejects unknown ones', () => {
    expect(parseLiveField('{{fee D0120 | $65}}')).toEqual({ kind: 'fee', codes: ['D0120'], fallback: '$65' });
    expect(parseLiveField('{{ fee D4341 / D4342 }}')).toEqual({ kind: 'fee', codes: ['D4341', 'D4342'], fallback: '' });
    expect(parseLiveField('{{setting broken_appointments.fee | $75}}')).toEqual({ kind: 'setting', key: 'broken_appointments.fee', fallback: '$75' });
    expect(parseLiveField('{{setting nonsense | 1}}')).toBeNull();
    expect(parseLiveField('{{fee nothing here | $1}}')).toBeNull();
    expect(splitLiveFields('costs {{fee 4002 | $43}} today').map(p => (typeof p === 'string' ? p : p.kind))).toEqual(['costs ', 'fee', ' today']);
    expect(stripLiveFields('A {{fee D0120 | $65}} fee and {{setting broken_appointments.notice_hours | 48}} hours')).toBe('A $65 fee and 48 hours');
  });
  it('resolves values from the office, and reports nothing when the office has none', () => {
    const values = { fees: state.fees!.byCode, settings: state.settings };
    expect(resolveLiveField(parseLiveField('{{fee 4002 | $43}}')!, values)).toBe('$44');
    expect(resolveLiveField(parseLiveField('{{fee D4341 / D4342}}')!, values)).toBe('$338 / $264');
    expect(resolveLiveField(parseLiveField('{{fee D9999 | $1}}')!, values)).toBeNull();
    expect(resolveLiveField(parseLiveField('{{setting broken_appointments.prepay_floor | $150}}')!, values)).toBe('$150');
    expect(resolveLiveField(parseLiveField('{{setting broken_appointments.notice_hours | 48}}')!, { settings: null })).toBeNull();
  });
});

describe('live fields in the reader', () => {
  it('shows current values inside text, and fallbacks where the office has none', () => {
    render(<MemoryRouter><HandbookLiveProvider><BlockView id="a" query="" block={{ type: 'para', text: 'The PSQ evaluation is {{fee 4002 | $43}}; the fee is {{setting broken_appointments.fee | $75}} after {{setting broken_appointments.notice_hours | 48}} business hours; a mystery costs {{fee D9999 | $9}}.' }} /></HandbookLiveProvider></MemoryRouter>);
    expect(screen.getByText('$44')).toHaveClass('handbook-live-value');
    expect(screen.getByText('$75')).toHaveClass('handbook-live-value');
    expect(screen.getByText('48')).toHaveAttribute('title', expect.stringContaining('Broken Appointments settings'));
    expect(document.querySelector('p')?.textContent).toContain('a mystery costs $9.');
  });
  it('falls back to the printed text outside a provider', () => {
    render(<MemoryRouter><BlockView id="b" query="" block={{ type: 'para', text: 'Fee: {{fee D0120 | $63}}.' }} /></MemoryRouter>);
    expect(document.querySelector('p')?.textContent).toBe('Fee: $63.');
    expect(document.querySelector('.handbook-live-value')).toBeNull();
  });
});

describe('templates and photos', () => {
  it('keeps a fenced template verbatim and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const blocks = parseDocBlocks(['Paste this:', '', '```', 'Group:', '', 'Frequencies', 'BWX:', '-----', '# not a heading', '```', '', 'Done.'].join('\n'));
    expect(blocks.map(b => b.type)).toEqual(['para', 'code', 'para']);
    expect(blocks[1]).toEqual({ type: 'code', text: 'Group:\n\nFrequencies\nBWX:\n-----\n# not a heading' });
    render(<MemoryRouter><ReaderBody blocks={blocks} highlight="" /></MemoryRouter>);
    expect(screen.getByText(/# not a heading/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('Group:\n\nFrequencies\nBWX:\n-----\n# not a heading');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
  it('renders image lines as figures and groups a run of them into a grid', () => {
    const blocks = parseDocBlocks(['## Photos', '![Facial profile](https://example.test/a.jpg)', '![Smile](https://example.test/b.jpg)', '', 'One more:', '![Single](https://example.test/c.jpg)'].join('\n'));
    expect(blocks.map(b => b.type)).toEqual(['heading', 'image', 'image', 'para', 'image']);
    render(<MemoryRouter><ReaderBody blocks={blocks} highlight="" /></MemoryRouter>);
    expect(document.querySelectorAll('.handbook-figure-grid')).toHaveLength(1);
    expect(document.querySelectorAll('.handbook-figure-grid .handbook-figure')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Single' })).toHaveAttribute('src', 'https://example.test/c.jpg');
    expect(screen.getByText('Facial profile').closest('figcaption')).not.toBeNull();
  });
});
