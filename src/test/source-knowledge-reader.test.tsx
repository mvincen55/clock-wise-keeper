import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SourceKnowledgeReader from '@/components/knowledge/SourceKnowledgeReader';
import { parseDocBlocks } from '@/lib/doc-format';
import { sourceSections } from '@/lib/source-knowledge';

// Synthetic handbook text only — no office content.
const blocks = parseDocBlocks(['## Workflow Policies', '### Seating Patients Protocol', '1. Greet the patient.', '2. Offer a blanket.', '### Attendance Policy', 'Arrive on time.', '### Call Light System', '| Light | Meaning |', '| --- | --- |', '| Red | Doctor needed |'].join('\n'));
const state = vi.hoisted(() => ({ role: 'employee', sections: [] as unknown[], docs: [] as unknown[], isLoading: false, error: null as Error | null }));
state.sections = sourceSections({ id: 'doc-1', title: 'Policy Handbook', defaultKind: 'policy' }, blocks);
state.docs = [{ id: 'doc-1', title: 'Policy Handbook', category: 'policy', library_area: 'workplace', collection: 'handbook', char_count: 100 }];
vi.mock('@/hooks/useSourceKnowledge', () => ({ useSourceKnowledge: () => state }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: state.role } }) }));
vi.mock('@/hooks/useOfficeFeeLookup', () => ({ useOfficeFeeLookup: () => ({ data: null }) }));

function show(initial = '/playbook/procedures') {
  return render(<MemoryRouter initialEntries={[initial]}><SourceKnowledgeReader kind="procedure" title="Office Procedures" subtitle="How we work" empty={<p>Nothing published</p>} /></MemoryRouter>);
}

afterEach(() => { cleanup(); state.role = 'employee'; });

describe('SourceKnowledgeReader', () => {
  it('lists only the requested kind, grouped by part, and links back to the handbook section', () => {
    show();
    expect(screen.getByRole('status')).toHaveTextContent('2 procedures from your office documents');
    expect(screen.getByRole('button', { name: 'Seating Patients Protocol' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Attendance Policy' })).not.toBeInTheDocument();
    expect(screen.getByText('Greet the patient.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Read in the handbook/ })).toHaveAttribute('href', '/handbook?doc=doc-1&section=1');
    expect(screen.queryByText(/Manage Policies/)).not.toBeInTheDocument();
  });
  it('opens the section named in the URL and searches section text', () => {
    show('/playbook/procedures?section=doc-1%3A5');
    expect(screen.getByRole('heading', { level: 2, name: 'Call Light System' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search procedures'), { target: { value: 'blanket' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 matching result');
    expect(screen.getByRole('heading', { level: 2, name: 'Seating Patients Protocol' })).toBeInTheDocument();
  });
  it('tells managers where to publish and falls back to the empty state with nothing to read', () => {
    state.role = 'manager';
    const view = show();
    expect(screen.getByRole('link', { name: 'Manage Policies & Procedures' })).toHaveAttribute('href', '/management/knowledge');
    view.unmount();
    const saved = state.sections;
    state.sections = [];
    show();
    expect(screen.getByText('Nothing published')).toBeInTheDocument();
    state.sections = saved;
  });
});
