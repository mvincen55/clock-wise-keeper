import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMissingShifts } from '@/hooks/useMissingShifts';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { setAppTimezone } from '@/lib/time-utils';

const state = vi.hoisted(() => ({
  off: [] as { date_start: string; date_end: string; type: string }[],
  closures: [] as { closure_date: string }[],
  endTime: '17:00',
  versioned: true,
}));
vi.mock('@/hooks/usePracticeSettings', () => ({ useClocksIn: () => true }));
vi.mock('@/hooks/useScheduleVersions', async original => ({
  ...(await original<typeof import('@/hooks/useScheduleVersions')>()),
  useScheduleVersions: () => ({ data: state.versioned ? [{
    effective_start_date: '2025-01-01', effective_end_date: null,
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, enabled: true, end_time: state.endTime })),
  }] : [] }),
}));
vi.mock('@/hooks/useWorkSchedule', async original => ({
  ...(await original<typeof import('@/hooks/useWorkSchedule')>()),
  useWorkSchedule: () => ({ data: Array.from({ length: 7 }, (_, weekday) => ({ weekday, enabled: true, end_time: state.endTime })) }),
}));
vi.mock('@/hooks/useTimeEntries', () => ({ useTimeEntries: () => ({ data: [] }) }));
vi.mock('@/hooks/useDaysOff', () => ({ useDaysOff: () => ({ data: state.off }) }));
vi.mock('@/hooks/useOfficeClosures', () => ({
  useOfficeClosures: vi.fn((year?: number) => ({ data: state.closures.filter(c => !year || c.closure_date.startsWith(`${year}-`)) })),
}));
vi.mock('@/hooks/useAttendanceExceptions', () => ({ useAttendanceExceptions: () => ({ data: [] }) }));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: { missing_shift_buffer_minutes: 60 } }) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-15T23:00:00Z'));
  setAppTimezone('America/New_York');
  state.off = [];
  state.closures = [];
  state.endTime = '17:00';
  state.versioned = true;
});
afterEach(() => { cleanup(); vi.useRealTimers(); setAppTimezone(null); vi.clearAllMocks(); });

describe('missing shifts use calendar dates and the configured timezone', () => {
  it.each([
    ['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'],
    ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'],
  ])('keeps inclusive leave dates through a daylight-saving change (%s)', (start, offStart, offEnd, end) => {
    state.off = [{ date_start: offStart, date_end: offEnd, type: 'scheduled_with_notice' }];
    const { result } = renderHook(() => useMissingShifts(start, end));
    expect(result.current.map(d => d.date)).toEqual([start, end]);
  });

  it.each([
    ['America/New_York', '2026-07-15', '2026-07-15T22:00:00Z'],
    ['America/New_York', '2026-01-15', '2026-01-15T23:00:00Z'],
    ['America/New_York', '2026-03-08', '2026-03-08T22:00:00Z'],
    ['America/New_York', '2026-11-01', '2026-11-01T23:00:00Z'],
    ['America/Chicago', '2026-07-15', '2026-07-15T23:00:00Z'],
    ['Europe/Prague', '2026-07-15', '2026-07-15T16:00:00Z'],
    ['UTC', '2026-07-15', '2026-07-15T18:00:00Z'],
    ['Asia/Kolkata', '2026-07-15', '2026-07-15T12:30:00Z'],
  ])('waits through the full shift and buffer in %s on %s', (zone, date, deadline) => {
    setAppTimezone(zone);
    vi.setSystemTime(new Date(deadline));
    const { result } = renderHook(() => useMissingShifts(date, date));
    expect(result.current).toEqual([]);
    // The alert must update without a reload or a new query response.
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.map(d => d.date)).toEqual([date]);
  });

  it('keeps the full buffer when it runs past midnight', () => {
    state.endTime = '23:30';
    vi.setSystemTime(new Date('2026-09-16T04:15:00Z')); // 00:15 at the office
    const { result } = renderHook(() => useMissingShifts('2026-09-15', '2026-09-15'));
    expect(result.current).toEqual([]);
    act(() => vi.advanceTimersByTime(16 * 60_000));
    expect(result.current.map(d => d.date)).toEqual(['2026-09-15']);
  });

  it('anchors its default range to the app date when UTC is already in the next year', () => {
    vi.setSystemTime(new Date('2027-01-01T02:00:00Z')); // Dec 31, 9 PM at the office
    const { result } = renderHook(() => useMissingShifts());
    expect(result.current).toHaveLength(31);
    expect(result.current[0].date).toBe('2026-12-01');
    expect(result.current.at(-1)?.date).toBe('2026-12-31');
    expect(useOfficeClosures).toHaveBeenLastCalledWith(2026);
  });

  it('reads closures for both years when a selected range crosses New Year', () => {
    state.closures = [{ closure_date: '2025-12-31' }, { closure_date: '2026-01-01' }];
    const { result } = renderHook(() => useMissingShifts('2025-12-30', '2026-01-02'));
    expect(result.current.map(d => d.date)).toEqual(['2025-12-30', '2026-01-02']);
    expect(useOfficeClosures).toHaveBeenLastCalledWith(undefined);
  });

  it('applies the same date and time rules to a legacy schedule', () => {
    state.versioned = false;
    state.off = [{ date_start: '2026-09-14', date_end: '2026-09-15', type: 'unscheduled' }];
    const { result } = renderHook(() => useMissingShifts('2026-09-13', '2026-09-16'));
    expect(result.current.map(d => d.date)).toEqual(['2026-09-13', '2026-09-16']);
  });
});
