/**
 * A refused capture says what it looked like, by kind and count only. The
 * matched text never leaves the reader, so the kinds are all the card can
 * show, and enough to tell a privacy view that is off from a misread.
 */
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PrivacyViewCapture from '@/components/close-day/PrivacyViewCapture';
import { describeViolations } from '@/lib/privacy-violations';
vi.mock('@/hooks/useProviders', () => ({ useProviders: () => ({ data: [] }) }));
vi.mock('@/hooks/useEmployees', () => ({ useOrgEmployees: () => ({ data: [] }) }));
vi.mock('@/hooks/usePracticeSettings', () => ({ usePracticeSettings: () => ({ data: { mobile_capture_enabled: true } }) }));
vi.mock('@/hooks/useScheduleIntelligence', () => ({
  useLayoutProfiles: () => ({ data: [{ id: 'profile', is_default: true }] }), usePhraseRules: () => ({ data: [] }), useSaveScheduleMetrics: () => ({ mutateAsync: vi.fn() }),
  toLayoutProfile: () => ({ statusLegend: [{ status: 'completed' }, { status: 'open' }] }), toClassifierRules: () => [],
}));
vi.mock('@/lib/schedule-reader', async original => {
  const lib = await original<typeof import('@/lib/schedule-reader')>();
  return {
    ...lib, captureSupported: () => false, frameFromFile: async () => ({}), destroyCapture: async () => {},
    processScheduleFrame: async () => { throw new lib.ScheduleReaderError('PRIVACY_CHECK_FAILED', { violationKinds: 2, kinds: 'full_name:4,long_free_text:1' }); },
  };
});

it('turns the reader\'s kinds and counts into words, never text', () => {
  expect(describeViolations('full_name:4,long_free_text:1')).toBe('name-shaped text ×4, a long free-text note');
  expect(describeViolations('phone_number:1')).toBe('a phone number');
  expect(describeViolations('something_new:2')).toBe('something new ×2');
  expect(describeViolations(undefined)).toBeNull();
});

it('shows what a refused capture looked like under the refusal', async () => {
  const { container } = render(<PrivacyViewCapture closeoutId="day" date="2026-09-24" />);
  fireEvent.click(screen.getByRole('button', { name: "Capture Today's Schedule" }));
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File([''], 'posted.png', { type: 'image/png' })] } });
  await screen.findByText(/may contain patient-identifying details/);
  expect(screen.getByText(/What it looked like: name-shaped text ×4, a long free-text note\./)).toBeInTheDocument();
  expect(screen.getByText(/never the text/)).toBeInTheDocument();
});
