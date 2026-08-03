import { describe, expect, it } from 'vitest';
import {
  humanizeKey,
  humanizeText,
  humanizeValue,
  isIdRef,
  nudgeDestination,
} from '@/lib/nudge-display';

const INCIDENT_ID = '58b7d0a2-96d6-4fce-89a3-833f6da2fd69';

describe('nudgeDestination', () => {
  it('deep-links an incident nudge straight to its report', () => {
    const dest = nudgeDestination({
      kind: 'incident_follow_through',
      surface: 'dashboard',
      data_refs: { category: 'sharps_injury', incident_id: INCIDENT_ID, incident_date: '2026-07-29' },
    });
    expect(dest).toEqual({
      to: `/incident-reports?report=${INCIDENT_ID}`,
      label: 'Open the incident report',
    });
  });

  it('falls back to the incident list when the id is missing or not a row id', () => {
    expect(
      nudgeDestination({ kind: 'incident_follow_through', data_refs: {} })?.to
    ).toBe('/incident-reports');
    expect(
      nudgeDestination({ kind: 'incident_follow_through', data_refs: { incident_id: 'nope' } })?.to
    ).toBe('/incident-reports');
  });

  it('routes the reminder kinds to their pages', () => {
    expect(nudgeDestination({ kind: 'training_due', data_refs: {} })?.to).toBe('/training?tab=mine');
    expect(nudgeDestination({ kind: 'goal_task_due', data_refs: {} })?.to).toBe('/goals');
    expect(nudgeDestination({ kind: 'plan_stall', data_refs: {} })?.to).toBe('/goals');
    expect(nudgeDestination({ kind: 'sprint_suggestion', data_refs: {} })?.to).toBe('/');
    expect(nudgeDestination({ kind: 'close_day_insight', data_refs: {} })?.to).toBe('/deposit-log');
  });

  it('routes an unknown kind by the surface it was aimed at', () => {
    expect(nudgeDestination({ kind: 'mystery', surface: 'deposit', data_refs: {} })?.to).toBe(
      '/deposit-log'
    );
    expect(nudgeDestination({ kind: 'mystery', surface: 'clock', data_refs: {} })?.to).toBe(
      '/timesheet'
    );
  });

  it('returns null only when nothing resolves', () => {
    expect(nudgeDestination({ kind: 'mystery', surface: 'nowhere', data_refs: {} })).toBeNull();
  });
});

describe('isIdRef', () => {
  it('flags id-shaped keys and UUID values, whatever the key', () => {
    expect(isIdRef('incident_id', INCIDENT_ID)).toBe(true);
    expect(isIdRef('goal_id', 'g1')).toBe(true);
    expect(isIdRef('anything', INCIDENT_ID)).toBe(true);
  });

  it('leaves readable entries alone', () => {
    expect(isIdRef('category', 'sharps_injury')).toBe(false);
    expect(isIdRef('incident_date', '2026-07-29')).toBe(false);
    expect(isIdRef('progress', 3)).toBe(false);
  });
});

describe('humanizeKey / humanizeValue', () => {
  it('spells keys out', () => {
    expect(humanizeKey('incident_date')).toBe('Incident date');
    expect(humanizeKey('true_open_minutes')).toBe('True open minutes');
  });

  it('uses the incident vocabulary for known category codes', () => {
    expect(humanizeValue('sharps_injury')).toBe('Sharps / needlestick');
    expect(humanizeValue('slip_trip_fall')).toBe('Slip, trip, or fall');
  });

  it('spaces out unknown snake_case codes', () => {
    expect(humanizeValue('about_right')).toBe('About right');
  });

  it('renders dates as dates and keeps plain values plain', () => {
    expect(humanizeValue('2026-07-29')).toContain('Jul 29, 2026');
    expect(humanizeValue(480)).toBe('480');
    expect(humanizeValue(true)).toBe('Yes');
    expect(humanizeValue(null)).toBe('—');
  });
});

describe('humanizeText', () => {
  it('spells out codes quoted inside a nudge sentence', () => {
    expect(
      humanizeText('An incident report was filed 2026-07-29 (sharps_injury). Consider assigning a module.')
    ).toBe('An incident report was filed 2026-07-29 (Sharps / needlestick). Consider assigning a module.');
  });

  it('spaces out unknown codes and leaves prose untouched', () => {
    expect(humanizeText('Check the goal_task_due item today.')).toBe('Check the goal task due item today.');
    expect(humanizeText('Nothing to change here.')).toBe('Nothing to change here.');
  });
});
