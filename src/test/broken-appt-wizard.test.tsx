import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import BrokenAppointments from '@/pages/BrokenAppointments';

// Phase 2 gates, exercised through the real wizard: the on-time path
// never asks for history, the LC→NS precedence case lands on Rung 3, and
// the VIP toggle forces the Rung 5 stop screen. Org hooks are mocked with
// the shipped defaults; everything patient-side stays in component state.

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

beforeAll(() => {
  // jsdom has no ResizeObserver (ScaledPrintPreview needs one).
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const setValue = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const clickContinue = () => fireEvent.click(screen.getByRole('button', { name: /continue/i }));

function fillCalculator(appt: { date: string; time: string }, notice: { date: string; time: string }) {
  setValue('Appointment date', appt.date);
  setValue('Appointment time', appt.time);
  setValue('Notice date', notice.date);
  setValue('Notice time', notice.time);
}

describe('Broken Appointments wizard', () => {
  it('shows the trust line', () => {
    render(<BrokenAppointments />);
    expect(
      screen.getByText(/Nothing entered here is saved or sent anywhere/i)
    ).toBeInTheDocument();
    cleanup();
  });

  it('mode A: LC then NS lands on Rung 3 (letter 9106)', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    // Step 1: today is a no-show.
    fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));
    clickContinue();
    // Step 2: Mon 8/10 9:00 appt, notice Sunday — late.
    fillCalculator({ date: '2026-08-10', time: '09:00' }, { date: '2026-08-09', time: '10:00' });
    expect(screen.getByText(/inside the window/i)).toBeInTheDocument();
    clickContinue();
    // Step 3: one prior late cancellation.
    setValue('Prior late cancellations', '1');
    clickContinue();
    // Step 4: patient info.
    setValue('First name', 'Ann');
    fireEvent.click(screen.getByRole('button', { name: /continue to outputs/i }));
    // Outputs: the precedence case must be Rung 3 / 9106 — never Rung 2.
    expect(screen.getByText('Rung 3')).toBeInTheDocument();
    expect(screen.getByText(/Letter 9106/i)).toBeInTheDocument();
    cleanup();
  });

  it('on-time path short-circuits and never asks for history', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /broken appointment/i }));
    fireEvent.click(screen.getByLabelText(/Late cancellation with a retrievable message/i));
    clickContinue();
    // Fri 8/14 2 PM appt, notice Mon 9 AM — plenty of notice.
    fillCalculator({ date: '2026-08-14', time: '14:00' }, { date: '2026-08-10', time: '09:00' });
    clickContinue();
    expect(screen.getByText(/No fee — post 9102, reschedule normally/i)).toBeInTheDocument();
    expect(screen.queryByText(/Patient history/i)).not.toBeInTheDocument();
    cleanup();
  });

  it('mode B: VIP toggle forces the Rung 5 stop screen with the holding reply only', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /respond to a cancellation text/i }));
    // Paste box first — the type is auto-set to LC per Rule 3.
    fireEvent.change(screen.getByPlaceholderText(/paste the text message/i), {
      target: { value: 'So sorry, need to cancel Monday!' },
    });
    clickContinue();
    fillCalculator({ date: '2026-08-10', time: '09:00' }, { date: '2026-08-09', time: '10:00' });
    clickContinue();
    // History: flip VIP — the rung engine must land on 5.
    fireEvent.click(screen.getByRole('switch', { name: /VIP-only scheduling/i }));
    clickContinue();
    expect(screen.getByText(/HARD STOP — front desk does not handle/i)).toBeInTheDocument();
    expect(screen.getByText(/Pending management decision/i)).toBeInTheDocument();
    expect(screen.queryByText(/Letter 910/i)).not.toBeInTheDocument();
    // The holding reply is the only reply offered.
    expect(screen.getByText('Holding reply (the only reply for Rung 5)')).toBeInTheDocument();
    cleanup();
  });

  it('mode B late text produces reply, note with pasted text, Pop-Up, and ledger', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /respond to a cancellation text/i }));
    fireEvent.change(screen.getByPlaceholderText(/paste the text message/i), {
      target: { value: 'Running behind, cancel me please' },
    });
    clickContinue();
    fillCalculator({ date: '2026-08-10', time: '09:00' }, { date: '2026-08-09', time: '10:00' });
    clickContinue();
    // No priors → first LC → Rung 1.
    clickContinue();
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
    fillCalculator({ date: '2026-08-10', time: '09:00' }, { date: '2026-08-09', time: '10:00' });
    clickContinue();
    clickContinue(); // no priors → first NS → Rung 2
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
    expect(written[0].endsWith('- MV')).toBe(true);
    cleanup();
  });
});
