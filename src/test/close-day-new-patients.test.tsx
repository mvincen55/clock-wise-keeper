/**
 * Close the Day — the two new-patient questions.
 *
 *  - both questions render in the Practice Vitals step, as aggregate counts;
 *  - blank stays blank ('' → null) and never silently becomes 0;
 *  - an explicit 0 is a deliberate, saved answer;
 *  - the Seal step shows both values, keeps them separate (seen vs scheduled),
 *    and refuses to seal a current-day closeout until both are answered;
 *  - nothing anywhere asks for a patient name or appointment identity.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// The vitals card's Radix sliders measure themselves; jsdom has no
// ResizeObserver, so stub the minimal surface they touch.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;
import DailyVitalsCard, { parseCountAnswer, type VitalsForm } from '@/components/DailyVitalsCard';
import SealDayCard from '@/components/close-day/SealDayCard';
import { EMPTY_STAFFING } from '@/components/close-day/StaffingRealityCard';
import type { DepositLog } from '@/hooks/useDepositLog';
import { getToday } from '@/lib/time-utils';

vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({ data: { org_id: 'o1', role: 'manager', org_name: 'Test' } }),
}));
vi.mock('@/hooks/useDepositLog', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useDepositLog')>();
  return {
    ...actual,
    useSealDay: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock('@/hooks/useTeamGoals', () => ({
  useCreateSprint: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useEmployeePermissions', () => ({
  useMyPermissionGrants: () => new Set<string>(),
}));

const vitals = (over: Partial<VitalsForm> = {}): VitalsForm => ({
  production: '',
  hygieneCancellations: 0,
  hygieneNoShows: 0,
  doctorCancellations: 0,
  doctorNoShows: 0,
  newPatientsScheduled: '',
  newPatientsSeen: '',
  ...over,
});

const log = (over: Partial<DepositLog> = {}): DepositLog =>
  ({
    id: 'log-1',
    deposit_date: getToday(),
    production_cents: 700_000,
    new_patients_scheduled_count: 2,
    new_patients_seen_count: 1,
    sealed_at: null,
    sealed_by: null,
    needs_manager_review: false,
    staffing_assessment: null,
    prepared_by_name: 'Test Person',
    ...over,
  }) as DepositLog;

/* ------------------------- parseCountAnswer ------------------------------ */

describe('parseCountAnswer', () => {
  it('blank means "not recorded", never 0', () => {
    expect(parseCountAnswer('')).toBeNull();
    expect(parseCountAnswer('   ')).toBeNull();
  });

  it('an explicit 0 is a real answer', () => {
    expect(parseCountAnswer('0')).toBe(0);
  });

  it('parses whole nonnegative counts', () => {
    expect(parseCountAnswer('7')).toBe(7);
    expect(parseCountAnswer('12')).toBe(12);
    expect(parseCountAnswer('abc')).toBeNull();
  });
});

/* --------------------------- vitals questions ---------------------------- */

describe('Practice Vitals new-patient questions', () => {
  it('renders both whole-number questions with aggregate framing', () => {
    render(<DailyVitalsCard value={vitals()} onChange={() => {}} />);
    expect(
      screen.getByLabelText(/How many new-patient appointments did we schedule today\?/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/How many new patients completed their first visit today\?/),
    ).toBeInTheDocument();
    // Counts only — no patient-identifying prompt anywhere on the card.
    expect(screen.queryByText(/patient name|chart|which patient/i)).not.toBeInTheDocument();
  });

  it('typing keeps digits only and reports through onChange', () => {
    const onChange = vi.fn();
    render(<DailyVitalsCard value={vitals()} onChange={onChange} />);
    fireEvent.change(
      screen.getByLabelText(/How many new patients completed their first visit today\?/),
      { target: { value: '3x' } },
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ newPatientsSeen: '3' }));
  });

  it('a stored explicit zero round-trips as "0", not as blank', () => {
    render(
      <DailyVitalsCard
        value={vitals({ newPatientsSeen: '0', newPatientsScheduled: '0' })}
        onChange={() => {}}
      />,
    );
    const seen = screen.getByLabelText(/completed their first visit/) as HTMLInputElement;
    expect(seen.value).toBe('0');
  });
});

/* ------------------------------ seal step -------------------------------- */

describe('Seal the Day summary', () => {
  const renderSeal = (l: DepositLog | null, date = getToday()) =>
    render(
      <SealDayCard
        log={l}
        date={date}
        collectionsCents={123_400}
        staffing={EMPTY_STAFFING}
        metrics={[]}
        dirty={false}
      />,
    );

  it('shows both new-patient values, clearly separated', () => {
    renderSeal(log());
    expect(screen.getByText('New patients seen')).toBeInTheDocument();
    expect(screen.getByText('New patients scheduled (pipeline)')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // Never combined into one "new patients" total.
    expect(screen.queryByText(/^3$/)).not.toBeInTheDocument();
  });

  it('unanswered questions read "Not recorded", never 0', () => {
    renderSeal(log({ new_patients_scheduled_count: null, new_patients_seen_count: null }));
    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
  });

  it('a current-day closeout cannot seal until both questions are answered', () => {
    renderSeal(log({ new_patients_seen_count: null }));
    expect(screen.getByRole('button', { name: /Seal the day/i })).toBeDisabled();
    expect(screen.getByText(/Answer both new-patient questions/)).toBeInTheDocument();
  });

  it('an explicit 0 answer satisfies the current-day gate', () => {
    renderSeal(log({ new_patients_scheduled_count: 0, new_patients_seen_count: 0 }));
    expect(screen.getByRole('button', { name: /Seal the day/i })).toBeEnabled();
  });

  it('an old migrated record may stay unrecorded and still seal', () => {
    renderSeal(
      log({
        deposit_date: '2026-01-05',
        new_patients_scheduled_count: null,
        new_patients_seen_count: null,
      }),
      '2026-01-05',
    );
    expect(screen.getByRole('button', { name: /Seal the day/i })).toBeEnabled();
  });
});
