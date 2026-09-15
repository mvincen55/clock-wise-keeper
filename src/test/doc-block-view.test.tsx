import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { BlockView, ReaderBody } from '@/components/library/DocBlockView';
import { parseDocBlocks } from '@/lib/doc-format';
import { outlineFromBlocks, outlineNumbers } from '@/lib/doc-library';

vi.mock('@/hooks/useOfficeFeeLookup', () => ({ useOfficeFeeLookup: () => ({ data: null }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: 'employee' } }) }));

afterEach(cleanup);

describe('BlockView', () => {
  it('renders labelled callouts and quoted scripts as their own blocks', () => {
    render(<MemoryRouter><BlockView id="a" query="" block={{ type: 'para', text: 'Important: When ALL call lights are lit, there is an emergency in the office.' }} /></MemoryRouter>);
    expect(screen.getByRole('note')).toHaveTextContent('When ALL call lights are lit');
    expect(screen.getByText('Important')).toHaveClass('handbook-callout-label');
    render(<MemoryRouter><BlockView id="b" query="" block={{ type: 'para', text: 'Text message: “Hi (Patient Name). We missed you at your appointment today. Please call to reschedule.”' }} /></MemoryRouter>);
    expect(screen.getByText('Text message')).toHaveClass('handbook-script-label');
    expect(screen.getByText(/We missed you at your appointment today/)).toBeInTheDocument();
    expect(document.querySelectorAll('.handbook-script')).toHaveLength(1);
  });
  it('leaves ordinary sentences, short quotes, and unlabelled prose as paragraphs', () => {
    render(<MemoryRouter><BlockView id="c" query="" block={{ type: 'para', text: 'Note that the office is closed for 12 to 14 days per calendar year.' }} /></MemoryRouter>);
    render(<MemoryRouter><BlockView id="d" query="" block={{ type: 'para', text: '“Short.”' }} /></MemoryRouter>);
    expect(document.querySelectorAll('.handbook-callout, .handbook-script')).toHaveLength(0);
    expect(document.querySelectorAll('p')).toHaveLength(2);
  });
  it('numbers headings from the outline and shows a self-numbered heading with its own number', () => {
    const blocks = parseDocBlocks(['## Employee Policies', '### Attendance Policy', 'Arrive on time.', '#### 1. Work Schedule', '- Be ready.'].join('\n'));
    const outline = outlineFromBlocks(blocks);
    const byId = outlineNumbers(outline);
    const numbers = new Map(outline.flatMap(item => (byId.get(item.id) ? [[item.blockIndex, byId.get(item.id)!] as const] : [])));
    render(<MemoryRouter><ReaderBody blocks={blocks} highlight="" handbook numbers={numbers} /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('1Employee Policies');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('1.1Attendance Policy');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('1Work Schedule');
    expect(screen.getByRole('heading', { level: 4 }).querySelector('.handbook-section-number')).toHaveTextContent('1');
  });
});
