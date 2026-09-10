import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FofAssistantWidget from '@/components/fof/FofAssistantWidget';
import { FOF_PATIENT_CONTEXT_ENABLED, fofTextNeedsReview, fofRuleNeedsReview, fofTrainingWriteAllowed } from '../../supabase/functions/_shared/fof-privacy';
import { printOnlyAdapter } from '@/lib/fof/persistence';

const mock = vi.hoisted(() => ({ invoke: vi.fn(), org: { org_id: 'office-one', role: 'manager' } }));
beforeAll(() => { HTMLElement.prototype.scrollTo = vi.fn(); });
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mock.invoke } } }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: mock.org }) }));
vi.mock('@/components/fof/CodeNotesPanel', () => ({ default: () => null }));
afterEach(() => { cleanup(); mock.invoke.mockReset(); mock.org = { org_id: 'office-one', role: 'manager' }; });
const context = { visits: [{ procedures: ['D6058'] }], treatment: 'private form context' };
function open() { fireEvent.click(screen.getByRole('button', { name: 'FOF Assistant' })); }
function send(text: string) {
  const input = screen.getByPlaceholderText('Ask about a code or office policy…');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('FOF assistant browser boundary', () => {
  it('keeps patient name and form context out of the request; training defaults off', async () => {
    mock.invoke.mockResolvedValue({ data: { reply: 'Office policy answer' } });
    render(<FofAssistantWidget patientName="Avery Morgan" context={context} />);
    open(); send('What is the office rule for D6058?');
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce());
    const body = mock.invoke.mock.calls[0][1].body;
    expect(body).toEqual({ mode: 'fof', trainingEnabled: false, messages: [{ role: 'user', content: 'What is the office rule for D6058?' }] });
    expect(JSON.stringify(body)).not.toMatch(/Avery|Morgan|private form|context/i);
  });
  it('blocks a lowercase first name copied from the current form before any network call', () => {
    render(<FofAssistantWidget patientName="Avery Morgan" context={context} />);
    open(); send('avery needs a crown');
    expect(mock.invoke).not.toHaveBeenCalled();
    expect(screen.getByText(/Please remove patient names/)).toBeTruthy();
  });
  it('requires an explicit Training toggle for an authorized user', async () => {
    mock.invoke.mockResolvedValue({ data: { reply: 'Saved' } });
    render(<FofAssistantWidget context={null} />); open();
    fireEvent.click(screen.getByRole('button', { name: 'Training off' }));
    send('Use delivery instead of seating');
    await waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce());
    expect(mock.invoke.mock.calls[0][1].body.trainingEnabled).toBe(true);
  });
  it('clears patient conversation and discards a reply arriving after the patient changes', async () => {
    let finish!: (value: unknown) => void;
    mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<FofAssistantWidget patientName="Avery Morgan" context={context} />);
    open(); send('What is D6058?');
    view.rerender(<FofAssistantWidget patientName="Taylor Reed" context={context} />);
    finish({ data: { reply: 'Old conversation answer' } });
    await waitFor(() => expect(screen.queryByText('Thinking…')).toBeNull());
    expect(screen.queryByText('What is D6058?')).toBeNull();
    expect(screen.queryByText('Old conversation answer')).toBeNull();
  });
});

describe('FOF server privacy rules', () => {
  it('does not allow client flags or staff roles to enable patient context or training', () => {
    expect(FOF_PATIENT_CONTEXT_ENABLED).toBe(false);
    expect(fofTrainingWriteAllowed('staff', true)).toBe(false);
    expect(fofTrainingWriteAllowed('owner', undefined)).toBe(false);
    expect(fofTrainingWriteAllowed('manager', false)).toBe(false);
    expect(fofTrainingWriteAllowed('owner', true)).toBe(true);
  });
  it('rejects identifiers, dates and case-specific knowledge while allowing general policy', () => {
    for (const text of ['Member ID: ABC123456', 'DOB 01/01/1980', 'Call Avery Morgan', 'Chart #1234']) expect(fofTextNeedsReview(text)).toBe(true);
    for (const text of ['this patient owes $600', 'tooth #19 needs a crown']) expect(fofRuleNeedsReview(text)).toBe(true);
    expect(fofRuleNeedsReview('Collect the remaining balance at delivery.')).toBe(false);
  });
  it('has no saving adapter for patient forms', async () => {
    expect(printOnlyAdapter.canSave).toBe(false);
    await expect(printOnlyAdapter.save({} as never)).rejects.toThrow('Saving is disabled');
  });
});
