import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HandbookReferenceTable from '@/components/handbook/HandbookReferenceTable';

// Synthetic schedule and rows only.
const state = vi.hoisted(() => ({ lookup: { scheduleName: 'Office Fee Schedule', byCode: new Map([['D0120', 6500], ['D9944', 81400]]) } as { scheduleName: string; byCode: Map<string, number> } | null, role: 'employee' }));
vi.mock('@/hooks/useOfficeFeeLookup', () => ({ useOfficeFeeLookup: () => ({ data: state.lookup }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: state.role } }) }));

const rows = [['Code', 'Procedure', 'Office Fee (as of last year)'], ['D0120', 'Periodic exam', '$65'], ['D9944p', 'Night guard', '$598'], ['D0999', 'Not on the schedule', '$10']];

afterEach(cleanup);

describe('HandbookReferenceTable', () => {
  it('shows current fees from the office schedule and keeps a differing printed figure visible', () => {
    render(<MemoryRouter><HandbookReferenceTable rows={rows} /></MemoryRouter>);
    expect(screen.getByRole('columnheader', { name: 'Office Fee (as of last year)' })).toBeInTheDocument();
    expect(screen.getByText('$814')).toHaveClass('handbook-live-fee');
    expect(screen.queryByText('$598')).not.toBeInTheDocument();
    expect(screen.getByText('$65')).toHaveClass('handbook-live-fee');
    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.getByText(/Fees come from the office fee schedule \(Office Fee Schedule\)/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open the fee schedule' })).not.toBeInTheDocument();
  });
  it('offers managers the fee schedule and leaves non-fee and headerless tables untouched', () => {
    state.role = 'manager';
    const view = render(<MemoryRouter><HandbookReferenceTable rows={rows} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Open the fee schedule' })).toHaveAttribute('href', '/fof/fees');
    view.unmount();
    render(<MemoryRouter><HandbookReferenceTable rows={[['', ''], ['Monday', 'Deposit']]} hasHeader={false} /></MemoryRouter>);
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Monday' })).toBeInTheDocument();
    expect(screen.queryByText(/Fees come from/)).not.toBeInTheDocument();
  });
  it('renders the document as written when the office has no fee schedule', () => {
    state.lookup = null;
    render(<MemoryRouter><HandbookReferenceTable rows={rows} /></MemoryRouter>);
    expect(screen.getByText('$598')).toBeInTheDocument();
    expect(screen.queryByText('$814')).not.toBeInTheDocument();
  });
});
