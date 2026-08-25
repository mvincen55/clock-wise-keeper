/**
 * Practice Settings — Office Performance Goals section.
 *
 *  - three parallel goals, each with its own input and its own visibility
 *    selector (never one shared switch);
 *  - goal inputs commit on blur/Enter — no mutation per keystroke;
 *  - blank commits 0 ("no goal configured"), never a fake target;
 *  - the new-patient goal shows the calendar-approximate weekly pace;
 *  - the old "falls back to last month" claim is gone — prior months are
 *    comparisons, not targets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PracticeSettingsCard } from '@/components/settings/PracticeSettingsCard';
import type { PracticeSettings } from '@/hooks/usePracticeSettings';

const mutate = vi.fn();

const settings: PracticeSettings = {
  collections_visibility: 'everyone',
  monthly_collections_target_cents: 15_000_000,
  production_visibility: 'everyone',
  monthly_production_target_cents: 0,
  new_patients_visibility: 'everyone',
  monthly_new_patients_seen_target_count: 40,
  mobile_capture_enabled: false,
  confirmation_lead_days: 2,
  pms_system: 'not_configured',
  require_pin_on_signoff: true,
  pin_lockout_attempts: 5,
  pin_lockout_minutes: 15,
};

vi.mock('@/hooks/usePracticeSettings', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/usePracticeSettings')>();
  return {
    ...actual,
    usePracticeSettings: () => ({ data: settings, isLoading: false }),
    useUpsertPracticeSettings: () => ({ mutate }),
  };
});

beforeEach(() => mutate.mockClear());

describe('office performance goals', () => {
  it('renders three parallel goals, each with its own visibility selector', () => {
    render(<PracticeSettingsCard />);
    expect(screen.getByText('Monthly production goal')).toBeInTheDocument();
    expect(screen.getByText('Monthly collections goal')).toBeInTheDocument();
    expect(screen.getByText('Monthly new patients seen goal')).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly production goal visibility')).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly collections goal visibility')).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly new patients seen goal visibility')).toBeInTheDocument();
  });

  it('explains each number in plain language, without secrecy framing', () => {
    render(<PracticeSettingsCard />);
    expect(
      screen.getByText('The value of care delivered. This is different from money collected.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Insurance timing means this will not always match production\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/New patients scheduled are tracked separately as the pipeline\./),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/secret|confidential/i);
  });

  it('does NOT mutate on every keystroke — only on blur', () => {
    render(<PracticeSettingsCard />);
    const input = screen.getByLabelText('Monthly production goal');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '16' } });
    fireEvent.change(input, { target: { value: '160000' } });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ monthly_production_target_cents: 16_000_000 });
  });

  it('clearing a goal commits 0 — "no goal configured", not a fake target', () => {
    render(<PracticeSettingsCard />);
    const input = screen.getByLabelText('Monthly collections goal');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(mutate).toHaveBeenCalledWith(
      { monthly_collections_target_cents: 0 },
      expect.anything(),
    );
  });

  it('an unchanged value never fires a mutation on blur', () => {
    render(<PracticeSettingsCard />);
    const input = screen.getByLabelText('Monthly collections goal');
    fireEvent.blur(input);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows the honest approximate weekly pace for the new-patient goal', () => {
    render(<PracticeSettingsCard />);
    expect(screen.getByText(/About \d+ new patients per week keeps/)).toBeInTheDocument();
    expect(screen.getByText(/calendar approximation/)).toBeInTheDocument();
  });

  it('the "falls back to last month" claim is gone; prior month is a comparison', () => {
    render(<PracticeSettingsCard />);
    expect(document.body.textContent).not.toMatch(/fall back to last month/i);
    expect(screen.getByText(/never treated as a target/)).toBeInTheDocument();
  });
});
