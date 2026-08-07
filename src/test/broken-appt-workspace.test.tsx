import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import BrokenAppointments from '@/pages/BrokenAppointments';

// The decision-first workspace, exercised end to end: the rung appears the
// moment the policy engine has what it needs (what happened + notice +
// history) — never behind patient info; the calculator is optional; the
// Future Appointments section obeys the engine's futureAppts flag; the
// checklist stamps the canonical staff code; and the Rung 5 / on-time /
// precedence gates from the old wizard all still hold. Org hooks are
// mocked with the shipped defaults; everything patient-side stays in
// component state.

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
// so individual tests can swap the list.
let fofDoctorNames = ['Dr. Scott', 'Dr. Taylor'];
vi.mock('@/hooks/useFofTemplates', () => ({
  useFofSettings: () => ({ data: { doctorNames: fofDoctorNames } }),
}));

// Canonical staff attribution — the ONLY identity the workspace stamps.
let myStaffCode: string | null = 'MEG';
vi.mock('@/hooks/useStaffCodes', () => ({
  useMyStaffCode: () => ({ code: myStaffCode, isLoading: false }),
}));

// The office PMS drives Dentrix help + capture affordances.
let pmsSystem = 'dentrix';
vi.mock('@/hooks/usePracticeSettings', () => ({
  usePracticeSettings: () => ({ data: { pms_system: pmsSystem } }),
}));

vi.mock('@/hooks/useCorrespondenceSettings', async () => {
  const { DEFAULT_CORRESPONDENCE_SETTINGS } = await import('@/lib/letters/types');
  return {
    useCorrespondenceSettings: () => ({ data: DEFAULT_CORRESPONDENCE_SETTINGS }),
  };
});

vi.mock('@/hooks/useSignerOptions', () => ({
  useSignerOptions: () => ({
    options: [
      {
        key: 'office',
        kind: 'office',
        label: 'Megan Vincent (office signer)',
        name: 'Megan Vincent',
        title: 'Office Manager',
        signatureUserId: null,
      },
    ],
    defaultKey: 'office',
  }),
}));

vi.mock('@/hooks/useStaffSignature', () => ({
  useSignatureImage: () => ({ data: null }),
}));

// The capture dialog owns screen sharing + OCR — not under jsdom test here
// (its privacy boundary is covered by broken-appt-capture-privacy.test.ts).
vi.mock('@/components/broken-appts/PmsCaptureDialog', () => ({
  default: () => null,
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

beforeEach(() => {
  myStaffCode = 'MEG';
  pmsSystem = 'dentrix';
});

const setValue = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const pickNoShow = () =>
  fireEvent.click(screen.getByLabelText(/No-show, or no retrievable record/i));

const answerNotice = (answer: 'Yes' | 'No') =>
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${answer}$`) }));

describe('decision-first workspace', () => {
  it('shows the trust line', () => {
    render(<BrokenAppointments />);
    expect(
      screen.getByText(/Nothing entered here is saved or sent anywhere/i)
    ).toBeInTheDocument();
    cleanup();
  });

  it('the rung and every operational output appear WITHOUT any patient info', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    // No priors → first NS → Rung 2, shown immediately.
    expect(screen.getByText('Rung 2', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Today's code: 9100/i)).toBeInTheDocument();
    // Operational guidance is already on screen — before any mailing info.
    expect(screen.getByText('Appointment note (Dentrix)')).toBeInTheDocument();
    expect(screen.getByText(/Pop-Up \(Dentrix\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Ledger \/ action checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/Letter 9100A/i)).toBeInTheDocument();
    cleanup();
  });

  it('no calculator required: answering No directly is enough', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    expect(screen.getByText('Rung 2', { selector: 'span' })).toBeInTheDocument();
    // The calculator dialog never opened.
    expect(screen.queryByText(/Business-hour notice calculator/i)).not.toBeInTheDocument();
    cleanup();
  });

  it('LC then NS lands on Rung 3 (letter 9106) — precedence preserved', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    setValue('Prior late cancellations', '1');
    expect(screen.getByText('Rung 3', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Letter 9106/i)).toBeInTheDocument();
    cleanup();
  });

  it('enough notice short-circuits: on-time result, no history asked', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByLabelText(/Late cancellation with a retrievable message/i));
    answerNotice('Yes');
    expect(screen.getByText(/No fee — post 9102, reschedule normally/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Prior late cancellations')).not.toBeInTheDocument();
    cleanup();
  });

  it('the optional calculator applies its verdict into the notice answer', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    fireEvent.click(screen.getByRole('button', { name: /Not sure\? Calculate/i }));
    // Mon 8/10 9:00 appt, notice Sunday — late (weekend never counts).
    fireEvent.change(screen.getByLabelText('Appointment date'), { target: { value: '2026-08-10' } });
    fireEvent.change(screen.getByLabelText('Appointment time'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Notice date'), { target: { value: '2026-08-09' } });
    fireEvent.change(screen.getByLabelText('Notice time'), { target: { value: '10:00' } });
    expect(screen.getByText(/Cutoff for enough notice/i)).toBeInTheDocument();
    expect(screen.getByText(/inside the window/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Apply Result/i }));
    // Applied "no" → the rung shows.
    expect(screen.getByText('Rung 2', { selector: 'span' })).toBeInTheDocument();
    cleanup();
  });

  it('VIP toggle forces the Rung 5 stop with the holding reply only', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    fireEvent.click(screen.getByRole('switch', { name: /VIP-only scheduling/i }));
    expect(screen.getByText(/HARD STOP — front desk does not handle/i)).toBeInTheDocument();
    expect(screen.queryByText(/Letter 910/i)).not.toBeInTheDocument();
    setValue('Patient first name (for the holding reply)', 'Ann');
    expect(screen.getByText('Holding reply (the only reply for Rung 5)')).toBeInTheDocument();
    expect(screen.getByText(/Got your message, Ann/i)).toBeInTheDocument();
    // The no-show outreach text must not appear at Rung 5.
    expect(screen.queryByText(/missed you at your appointment/i)).not.toBeInTheDocument();
    // The office copy can still be printed — it documents the OM handoff.
    expect(screen.getByRole('button', { name: /Print office copy/i })).toBeInTheDocument();
    cleanup();
  });

  it('mode B late text produces reply, note with pasted text, and no Pop-Up at Rung 1', () => {
    render(<BrokenAppointments />);
    fireEvent.click(screen.getByRole('button', { name: /respond to a cancellation text/i }));
    fireEvent.change(screen.getByPlaceholderText(/paste the text message/i), {
      target: { value: 'Running behind, cancel me please' },
    });
    answerNotice('No');
    expect(screen.getByText('Rung 1', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/No Pop-Up required/i)).toBeInTheDocument();
    expect(screen.getByText(/Reply to copy-paste/i)).toBeInTheDocument();
    const note = screen.getByText(/Patient texted to cancel/i);
    expect(note.textContent).toContain("'Running behind, cancel me please'");
    // The pasted content appears nowhere except the note block — not the
    // reply, the letter (preview or print portal), or the checklist.
    const occurrences = [...document.querySelectorAll('pre')].filter(p =>
      p.textContent!.includes('Running behind, cancel me please')
    ).length;
    expect(occurrences).toBe(1);
    cleanup();
  });
});

describe('conditional Future Appointments (engine-driven)', () => {
  it('stays completely hidden when the rung takes no future-appointment action', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No'); // Rung 2
    expect(screen.queryByText(/Future appointments/i)).not.toBeInTheDocument();
    // Only the address capture shortcut exists — no appointments capture.
    expect(screen.getAllByRole('button', { name: /Capture from Dentrix/i })).toHaveLength(1);
    cleanup();
  });

  it('appears with its capture shortcut when the rung cancels future appointments', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    setValue('Prior late cancellations', '2'); // → Rung 4
    expect(screen.getByText('Rung 4', { selector: 'span' })).toBeInTheDocument();
    // The section card (not the letter wording, which also mentions them).
    expect(screen.getByText(/Future appointments \(canceled/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Capture from Dentrix/i })).toHaveLength(2);
    cleanup();
  });

  it('rung 4 provider choice offers the FOF doctor list', async () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    setValue('Prior late cancellations', '2');
    const trigger = screen.getByRole('combobox', { name: 'Appointment 1 provider' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const option = await screen.findByRole('option', { name: 'Dr. Scott' });
    fireEvent.keyDown(option, { key: 'Enter' });
    expect(trigger.textContent).toContain('Dr. Scott');
    cleanup();
  });

  it('provider falls back to free text when no FOF doctors are configured', () => {
    fofDoctorNames = [];
    try {
      render(<BrokenAppointments />);
      pickNoShow();
      answerNotice('No');
      setValue('Prior late cancellations', '2');
      expect(screen.getByPlaceholderText('Provider')).toBeInTheDocument();
    } finally {
      fofDoctorNames = ['Dr. Scott', 'Dr. Taylor'];
      cleanup();
    }
  });
});

describe('interactive checklist + staff attribution', () => {
  const runToRung2 = () => {
    pickNoShow();
    answerNotice('No');
  };

  it('checking stamps the canonical staff code with date and time', () => {
    render(<BrokenAppointments />);
    runToRung2();
    const box = screen.getByRole('checkbox', { name: /Post 9100 \(auto-fee\)/i });
    fireEvent.click(box);
    const stamp = screen.getByText(/MEG • \d{2}\/\d{2}\/\d{4} • \d{1,2}:\d{2} (AM|PM)/);
    expect(stamp).toBeInTheDocument();
    cleanup();
  });

  it('unchecking removes the stamp; rechecking stamps fresh', () => {
    render(<BrokenAppointments />);
    runToRung2();
    const box = screen.getByRole('checkbox', { name: /Post 9100 \(auto-fee\)/i });
    fireEvent.click(box);
    expect(screen.getByText(/MEG • /)).toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.queryByText(/MEG • /)).not.toBeInTheDocument();
    fireEvent.click(box);
    expect(screen.getByText(/MEG • /)).toBeInTheDocument();
    cleanup();
  });

  it('every stamped output block carries the staff code, and copy is exact', async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => (written.push(t), Promise.resolve()) },
    });
    render(<BrokenAppointments />);
    runToRung2();
    const blocks = [...document.querySelectorAll('pre')].map(p => p.textContent!);
    // Note + Pop-Up render as stamped blocks ending with the code.
    expect(blocks.some(b => b.endsWith('- MEG'))).toBe(true);
    const popUpTitle = screen.getByText(/Pop-Up \(Dentrix\)/i);
    const popUpCard = popUpTitle.closest('div[class*="rounded-"]')!;
    const rendered = within(popUpCard as HTMLElement).getByText(/Rung 2 \/ No-show/i).textContent!;
    fireEvent.click(popUpTitle.parentElement!.querySelector('button')!);
    await screen.findByText('Copied');
    expect(written).toHaveLength(1);
    expect(written[0]).toBe(rendered);
    expect(written[0].endsWith('- MEG')).toBe(true);
    // The Dentrix copy of the checklist keeps the tested ☐ format.
    expect(screen.getByRole('button', { name: /Copy for Dentrix/i })).toBeInTheDocument();
    cleanup();
  });

  it('with no staff code assigned, outputs prompt for a manager instead of stamping', () => {
    myStaffCode = null;
    render(<BrokenAppointments />);
    runToRung2();
    expect(screen.getAllByText(/No staff code assigned yet/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('Appointment note (Dentrix)')).not.toBeInTheDocument();
    // Checklist can't be checked without attribution.
    const box = screen.getByRole('checkbox', { name: /Post 9100 \(auto-fee\)/i });
    expect(box).toBeDisabled();
    cleanup();
  });
});

describe('PMS-aware behavior', () => {
  it('a non-Dentrix office sees no Dentrix help and no capture buttons', () => {
    pmsSystem = 'open_dental';
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    expect(screen.queryByRole('button', { name: /Capture from Dentrix/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Where do I find this in Dentrix/i)).not.toBeInTheDocument();
    // Manual entry always works.
    expect(screen.getByLabelText('Street address')).toBeInTheDocument();
    cleanup();
  });

  it('an unconfigured office gets no Dentrix assumptions either', () => {
    pmsSystem = 'not_configured';
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    expect(screen.queryByRole('button', { name: /Capture from/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Where do I find this in/i)).not.toBeInTheDocument();
    cleanup();
  });

  it('a Dentrix office gets the contextual help control', () => {
    render(<BrokenAppointments />);
    pickNoShow();
    answerNotice('No');
    expect(
      screen.getAllByRole('button', { name: /Where do I find this in Dentrix/i }).length
    ).toBeGreaterThan(0);
    cleanup();
  });
});
