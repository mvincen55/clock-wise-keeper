import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PublishedKnowledgeReader from '@/components/knowledge/PublishedKnowledgeReader';
import type { PublishedKnowledgeLibrary } from '@/hooks/usePublishedKnowledge';

const state = vi.hoisted(() => ({ data: undefined as PublishedKnowledgeLibrary | undefined, error: null as Error | null }));
vi.mock('@/hooks/usePublishedKnowledge', () => ({ usePublishedKnowledge: () => ({ ...state, isLoading: false }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_name: 'Example Dental', role: 'employee' } }) }));

function show() {
  return render(<MemoryRouter><PublishedKnowledgeReader area="handbook" title="Employee Handbook" subtitle="Office policies" fallback={<p>Uploaded handbook</p>} /></MemoryRouter>);
}

beforeEach(() => {
  state.error = null;
  // Minimal, synthetic read-only rows. No practice content or credentials.
  state.data = {
    area: 'handbook', categories: [{ id: 'welcome', name: 'Welcome & Culture' }],
    entries: [
      { item: { id: 'one' }, category: { id: 'welcome', name: 'Welcome & Culture' }, version: { title: 'Working together', summary: 'Our team', version_number: 3, published_at: '2026-09-01', effective_on: '2026-09-02' }, blocks: [{ id: 'one-heading', block_type: 'heading', plain_text: 'Support' }, { id: 'one-body', block_type: 'paragraph', plain_text: 'Ask for help with [scheduling].' }] },
      { item: { id: 'two' }, category: null, version: { title: 'A long policy title that must stay visible without a category', summary: '', version_number: 1, published_at: null }, blocks: [] },
    ],
  } as unknown as PublishedKnowledgeLibrary;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe('employee handbook reader', () => {
  it('keeps the uploaded reader available before publication and on loading errors', () => {
    state.data = { area: 'handbook', categories: [], entries: [] };
    const view = show();
    expect(screen.getByText('Uploaded handbook')).toBeInTheDocument();
    view.unmount();
    state.error = new Error('Unavailable');
    show();
    expect(screen.getByText('Uploaded handbook')).toBeInTheDocument();
  });
  it('finds body matches, escapes special characters, shows excerpts and clears results', () => {
    show();
    fireEvent.change(screen.getByLabelText('Search the handbook'), { target: { value: '[scheduling]' } });
    expect(screen.getByRole('status')).toHaveTextContent('1 matching result');
    expect(within(screen.getByRole('navigation', { name: 'Employee Handbook contents' })).getByRole('button')).toHaveTextContent('Ask for help with [scheduling].');
    expect(document.querySelectorAll('mark')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search the handbook'), { target: { value: 'nothing matches' } });
    expect(screen.getByRole('heading', { name: 'No policies match “nothing matches”' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('status')).toHaveTextContent('2 policies');
  });
  it('keeps uncategorized policies reachable without inventing a category', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'A long policy title that must stay visible without a category' }));
    expect(screen.getByText('The text of this policy is not available. Ask your manager for a copy.')).toBeInTheDocument();
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
  });
  it('preserves version facts, policy text, section anchors, and the contextual assistant route', () => {
    show();
    expect(screen.getByText('Version 3')).toBeInTheDocument();
    expect(screen.getByText('Effective Sep 2, 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '#policy-section-one-heading');
    expect(screen.getByRole('heading', { name: 'Support' })).toHaveAttribute('id', 'policy-section-one-heading');
    expect(screen.getByRole('link', { name: 'Ask about this handbook' })).toHaveAttribute('href', '/assistant?scope=handbook');
    expect(screen.getByText('Ask for help with [scheduling].')).toBeInTheDocument();
  });
  it('exposes the mobile contents control state and current policy', () => {
    show();
    const toggle = screen.getByRole('button', { name: 'Browse contents' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide contents' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Working together' })).toHaveAttribute('aria-current', 'page');
  });
});
