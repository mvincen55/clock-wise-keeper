import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BrokenAppointments from '@/pages/BrokenAppointments';

// Phase 2 gates, exercised through the real wizard: the notice question is
// a plain Yes/No (the calculator is never a required entry step), the
// on-time path never asks for history, a 0001 on the ledger + a no-show
// lands on Rung 3 / letter 0004, a 0005 on the ledger (terminal) forces
// the Rung 5 stop screen, and the card questions appear only at Rungs 2–5
// (charge question only with a card at Rungs 3–5). Org hooks are mocked
// with the shipped defaults; everything patient-side stays in component
// state.

vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({
    data: { org_id: 'org-1', org_name: 'Test Office', role: 'manager', employee_id: 'e-1' },
  }),
}));

vi.mock('@/hooks/useOrgBranding', async importOriginal => {
  const mod = await importOriginal<typeof import('@/hooks/useOrgBranding')>();
  return {
    ...mod,
    useOrgBranding: () => ({
      data: {
        ...mod.GENERIC_BRANDING,
        displayName: 'Test Office',
        legalName: 'Test Office, LLC',
        addressLine1: '1 Main St',
        addressLine2: 'Testville, MA 02100',
        phone: '(555) 010-0000',
      },
    }),
  };
});

vi.mock('@/hooks/useBrokenApptSettings', () => ({
  useBrokenApptSettings: () => ({ data: undefined }),
}));

vi.mock('@/hooks/useBrokenApptTemplates', async () => {
  const { DEFAULT_BA_TEMPLATES } = await import('@/lib/broken-appts/defaults');
  return {
    useBrokenApptTemplates: () => ({
      data: DEFAULT_BA_TEMPLATES.map((t, i) => ({ ...t, id: `t-${i}` })),
      isLoading: false,
    }),
  };
});

// The Rung 4 provider dropdown pulls from the FOF doctor list; read lazily
// so individual tests can swap the list (e.g. empty → free-text fallback).
let fofDoctorNames = ['Dr. Scott', 'Dr. Taylor'];
vi.mock('@/hooks/useFofTemplates', () => ({
  useFofSettings: () => ({ data: { doctorNames: fofDoctorNames } }),
}));

beforeAll(() => {
  // jsdom has no ResizeObserver (ScaledPrintPreview needs one).
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // Radix Select needs these DOM APIs jsdom lacks.
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

const setValue = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const clickContinue = () => fireEvent.click(screen.getByRole('button', { name: /continue/i }));

/** Step 2: answer the Yes/No — no calculator entry involved. */
const answerNotice = (answer: 'yes' | 'no') => {
  fireEvent.click(
    screen.getByLabelText(answer === 'yes' ? /Yes — at least/i : /No — inside the window/i)
  );
  clickContinue();
};

const checkLedgerCode = (code: string) =>
  fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^${code} —`) }));

const checkNone = () =>
  fireEvent.click(screen.getByRole('checkbox', { name: /None of these letter codes/i }));

const answerCard = (card: 'yes' | 'no', charge?: 'yes' | 'no') => {
  fireEvent.click(
    screen.getByLabelText(card === 'yes' ? /Yes — a credit card is on file/i : /No card on file/i)
  );
  if (charge) {
    fireEvent.click(
      screen.getByLabelText(charge === 'yes' ? /Yes — the charge went through/i : /No — the card failed/i)
    );
  }
  clickContinue();
};

describe('Broken Appointments wizard', () => {
  it('shows the trust line', () => {
    render(<BrokenAppointments />);
    expect(
      screen.getByText(/Nothing entered here is saved or sent anywhere/i)
    ).toBeInTheDocument();
    cleanup();
  });

  it('mode A: a 0001 on the ledger + a no-show lands on Rung 3 / letter 0004 — zero calculator entries', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    // Step 1: today is a no-show.
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    // Step 2: plain Yes/No — the happy path never touches the calculator.
    answerNotice('no');
    // Step 3: the ledger shows a 0001.
    checkLedgerCode('0001');
    clickContinue();
    // Step 3½: card question — no card on file (Rung 3 asks no charge then).
    expect(screen.getByText(/Is a credit card on file\?/i)).toBeInTheDocument();
    answerCard('no');
    // Step 4: patient info.
    setValue('First name', 'Ann');
    fireEvent.click(screen.getByRole('button', { name: /continue to outputs/i }));
    // Outputs: the precedence case must be Rung 3 / 0004 — never Rung 2.
    expect(screen.getByText('Rung 3')).toBeInTheDocument();
    expect(screen.getByText(/Letter 0004 — print/i)).toBeInTheDocument();
    expect(screen.getByText(/posted as outstanding balance — collect a card/i)).toBeInTheDocument();
    cleanup();
  });

  it('on-time answer short-circuits with no calculator entry and never asks for history', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/Late cancellation with a retrievable message/i));
    clickContinue();
    answerNotice('yes');
    expect(screen.getByText(/No fee — post 9102, reschedule normally/i)).toBeInTheDocument();
    expect(screen.queryByText(/Patient history/i)).not.toBeInTheDocument();
    cleanup();
  });

  it('the cutoff expander auto-selects the Yes/No and shows the passive hint', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    // Open the expander and enter the times: Mon 8/10 9:00 appt, notice
    // Sunday 8/9 — late, so "No" auto-selects.
    fireEvent.click(screen.getByRole('button', { name: /Not sure\? Check the cutoff/i }));
    setValue('Notice date', '2026-08-09');
    setValue('Notice time', '10:00');
    setValue('Appointment date', '2026-08-10');
    setValue('Appointment time', '09:00');
    expect(screen.getByLabelText(/No — inside the window/i)).toBeChecked();
    // The passive hint under the Yes/No shows the computed cutoff.
    expect(screen.getByText(/Cutoff was Thu 8\/6\/2026 9:00 AM/i)).toBeInTheDocument();
    // An earlier notice flips the auto-selection to Yes.
    setValue('Notice date', '2026-08-03');
    setValue('Notice time', '09:00');
    expect(screen.getByLabelText(/Yes — at least/i)).toBeChecked();
    cleanup();
  });

  it('the side-panel cutoff tool works outside the wizard entirely', () => {
    render(<BrokenAppointments />);
    // Still on the entry screen — no wizard step started.
    fireEvent.click(screen.getByRole('button', { name: /Cutoff calculator/i }));
    setValue('Tool Appointment date', '2026-08-10');
    setValue('Tool Appointment time', '09:00');
    expect(screen.getByText(/Cutoff for enough notice: Thu 8\/6\/2026 9:00 AM/i)).toBeInTheDocument();
    cleanup();
  });

  it('mode B: a 0005 on the ledger forces the Rung 5 stop screen with the holding reply only', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /respond to a cancellation text/i }));
    // Paste box first — the type is auto-set to LC per Rule 3.
    fireEvent.change(screen.getByPlaceholderText(/paste the text message/i), {
      target: { value: 'So sorry, need to cancel Monday!' },
    });
    clickContinue();
    answerNotice('no');
    // History: 0005 is terminal — checking it alone routes to Rung 5.
    checkLedgerCode('0005');
    expect(screen.getByText(/0005 is terminal/i)).toBeInTheDocument();
    clickContinue();
    // Rung 5 still asks the card questions — they feed the OM note + Pop-Up.
    answerCard('no');
    expect(screen.getByText(/HARD STOP — front desk does not handle/i)).toBeInTheDocument();
    // Rung 5 ruling: no letter ever, and no pending-decision flag — the
    // screen is OM instructions plus the Pop-Up update and holding reply.
    expect(screen.queryByText(/Pending management decision/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/print & mail/i)).not.toBeInTheDocument();
    expect(screen.getByText('Pop-Up update (Dentrix)')).toBeInTheDocument();
    expect(screen.getByText('Holding reply (the only reply for Rung 5)')).toBeInTheDocument();
    cleanup();
  });

  it('mode A no-show at Rung 5 offers the holding reply, never outreach', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    answerNotice('no');
    checkLedgerCode('0005');
    clickContinue();
    answerCard('yes', 'yes');
    expect(screen.getByText(/HARD STOP — front desk does not handle/i)).toBeInTheDocument();
    setValue('Patient first name (for the holding reply)', 'Ann');
    expect(screen.getByText('Holding reply (the only reply for Rung 5)')).toBeInTheDocument();
    expect(screen.getByText(/Got your message, Ann/i)).toBeInTheDocument();
    // The no-show outreach text must not appear at Rung 5.
    expect(screen.queryByText(/missed you at your appointment/i)).not.toBeInTheDocument();
    cleanup();
  });

  it('mode B late text at Rung 1: reply + note with pasted text, no Pop-Up, no card question', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /respond to a cancellation text/i }));
    fireEvent.change(screen.getByPlaceholderText(/paste the text message/i), {
      target: { value: 'Running behind, cancel me please' },
    });
    clickContinue();
    answerNotice('no');
    // Clean history → Rung 1 → the card step is skipped entirely.
    checkNone();
    clickContinue();
    expect(screen.queryByText(/Is a credit card on file\?/i)).not.toBeInTheDocument();
    setValue('First name', 'Ann');
    fireEvent.click(screen.getByRole('button', { name: /continue to outputs/i }));
    expect(screen.getByText('Rung 1')).toBeInTheDocument();
    // Rung 1 shows no Pop-Up, explicitly.
    expect(screen.getByText(/no Pop-Up/i)).toBeInTheDocument();
    // The reply and the note render; the pasted text lives in the note only.
    expect(screen.getByText(/Reply to copy-paste/i)).toBeInTheDocument();
    const note = screen.getByText(/Patient texted to cancel/i);
    expect(note.textContent).toContain("'Running behind, cancel me please'");
    expect(screen.getByText(/Ledger checklist/i)).toBeInTheDocument();
    // Phase 5 gate: the pasted content appears nowhere except the note
    // block — not in the reply, the letter (preview or print portal),
    // the Pop-Up, or the ledger.
    const occurrences =
      document.body.textContent!.split('Running behind, cancel me please').length - 1;
    expect(occurrences).toBe(1);
    cleanup();
  });

  it('Rung 2 asks the card question but never the charge question', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    answerNotice('no');
    checkNone();
    clickContinue();
    // First no-show → Rung 2. Even with a card on file, no charge question.
    expect(screen.getByText(/Is a credit card on file\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Yes — a credit card is on file/i));
    expect(screen.queryByText(/charge go through\?/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Rung 2 is never charged/i)).toBeInTheDocument();
    cleanup();
  });

  it('the charge question appears at Rung 3 once a card is on file, and a failed charge surfaces the card-failure step', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    answerNotice('no');
    checkLedgerCode('0001');
    clickContinue();
    fireEvent.click(screen.getByLabelText(/Yes — a credit card is on file/i));
    expect(screen.getByText(/charge go through\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/No — the card failed/i));
    clickContinue();
    setValue('First name', 'Ann');
    fireEvent.click(screen.getByRole('button', { name: /continue to outputs/i }));
    // Outputs: failed charge → posted (never "charged to card") + the
    // 7-business-day card-failure step in the checklist.
    expect(screen.getByText(/card failed, start the 7-business-day/i)).toBeInTheDocument();
    const checklist = screen.getByText(/Card failure procedure/i);
    expect(checklist.textContent).toContain('7 business days');
    const popUp = screen.getByText(/Rung 3 \/ No-show/i);
    expect(popUp.textContent).toContain('$75 posted');
    expect(popUp.textContent).not.toContain('charged to card');
    cleanup();
  });

  it('rung 4 provider choice is a dropdown fed by the FOF doctor list', async () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    answerNotice('no');
    // A 0004 on the ledger → Rung 4, which asks for the canceled rows.
    checkLedgerCode('0004');
    clickContinue();
    answerCard('yes', 'yes');
    // The provider cell is a dropdown now, not free text.
    expect(screen.queryByPlaceholderText('Provider')).not.toBeInTheDocument();
    const trigger = screen.getByRole('combobox', { name: 'Appointment 1 provider' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const option = await screen.findByRole('option', { name: 'Dr. Scott' });
    expect(screen.getByRole('option', { name: 'Dr. Taylor' })).toBeInTheDocument();
    fireEvent.keyDown(option, { key: 'Enter' });
    expect(trigger.textContent).toContain('Dr. Scott');
    cleanup();
  });

  it('rung 4 provider falls back to free text when no FOF doctors are configured', () => {
    fofDoctorNames = [];
    try {
      render(<BrokenAppointments />);
      fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
      fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
      clickContinue();
      answerNotice('no');
      checkLedgerCode('0004');
      clickContinue();
      answerCard('yes', 'yes');
      expect(screen.getByPlaceholderText('Provider')).toBeInTheDocument();
      expect(
        screen.queryByRole('combobox', { name: 'Appointment 1 provider' })
      ).not.toBeInTheDocument();
    } finally {
      fofDoctorNames = ['Dr. Scott', 'Dr. Taylor'];
      cleanup();
    }
  });

  it('the copy button writes exactly the rendered text, dateline included', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => (written.push(t), Promise.resolve()) },
    });
    render(<BrokenAppointments />);
    fireEvent.change(screen.getByLabelText(/your initials/i), { target: { value: 'MV' } });
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    answerNotice('no');
    checkNone();
    clickContinue(); // clean history → first NS → Rung 2
    answerCard('no');
    setValue('First name', 'Ann');
    fireEvent.click(screen.getByRole('button', { name: /continue to outputs/i }));

    // Copy the Pop-Up and compare against the rendered block.
    const popUpTitle = screen.getByText(/Pop-Up \(Dentrix\)/i);
    const popUpCard = popUpTitle.closest('div[class*="rounded-"]')!;
    const rendered = popUpCard.querySelector('pre')!.textContent!;
    fireEvent.click(popUpTitle.parentElement!.querySelector('button')!);
    await screen.findByText('Copied');
    expect(written).toHaveLength(1);
    expect(written[0]).toBe(rendered);
    expect(written[0]).toContain('Rung 2 / No-show');
    expect(written[0]).toContain('$75 posted');
    expect(written[0]).not.toContain('charged to card');
    expect(written[0].endsWith('- MV')).toBe(true);
    cleanup();
  });
});
