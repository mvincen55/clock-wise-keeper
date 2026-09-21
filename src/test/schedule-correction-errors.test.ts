/**
 * Schedule corrections go through one transactional RPC. The RPC raises
 * plain sentences (an overlap names the other schedule's dates); the client
 * only has to translate what PostgREST and the database constraints say in
 * their own words, and never hide a message the server wrote for the manager.
 */
import { describe, it, expect } from 'vitest';
import { friendlyScheduleError } from '@/hooks/useEmployeeSchedules';

describe('friendlyScheduleError', () => {
  it('turns the overlap constraint into a sentence a manager can act on', () => {
    expect(friendlyScheduleError({ code: '23P01', message: 'conflicting key value violates exclusion constraint "no_overlapping_schedule_versions"' }))
      .toBe('These dates overlap another schedule for this employee. Edit or remove that schedule first.');
  });

  it('explains a correction attempted before the database update was applied', () => {
    const missing = friendlyScheduleError({ code: 'PGRST202', message: 'Could not find the function public.correct_employee_schedule(...) in the schema cache' });
    expect(missing).toMatch(/database update that has not been applied yet/);
    expect(friendlyScheduleError({ code: null, message: 'Could not find the function public.correct_employee_schedule' })).toBe(missing);
  });

  it('passes the server wording through untouched', () => {
    const raised = 'These dates overlap another schedule for this employee (Sep 7, 2026 to present). Edit or remove that schedule first.';
    expect(friendlyScheduleError({ code: '22023', message: raised })).toBe(raised);
    expect(friendlyScheduleError({ code: '42501', message: 'Only an office owner or manager can correct schedules' }))
      .toBe('Only an office owner or manager can correct schedules');
  });

  it('never returns an empty message', () => {
    expect(friendlyScheduleError(null)).toBe('Something went wrong while saving the schedule.');
    expect(friendlyScheduleError({ code: 'XX000', message: '' }, 'Custom fallback')).toBe('Custom fallback');
  });
});
