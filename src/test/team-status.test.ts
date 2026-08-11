/**
 * Team join-pipeline status — the one vocabulary the Team page speaks:
 *
 *  - "Pending"            → no login exists (open invite, or loginless record)
 *  - "Pending Onboarding" → login created, onboarding unfinished
 *  - "Active"             → onboarding complete
 *  - "Expired"            → invite lapsed before a login was created
 *
 * Plus the two backend rules that make the pipeline honest:
 *  - accept-invite must ALWAYS activate the employee record it links —
 *    a re-invited archived person was accepting successfully yet staying
 *    invisible on the Team page (the Jill bug);
 *  - resending an invite refreshes the 7-day expiry and revives an expired
 *    row instead of forking a duplicate.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { employeeTeamStatus, inviteTeamStatus } from '@/lib/team-status';

describe('employeeTeamStatus', () => {
  it('no login → "Pending", regardless of onboarding data', () => {
    const s = employeeTeamStatus({ hasLogin: false, onboarding: null });
    expect(s.label).toBe('Pending');
    expect(s.kind).toBe('pending_login');
    expect(s.detail).toMatch(/Login not created/);
  });

  it('login created, onboarding not started → "Pending Onboarding"', () => {
    const s = employeeTeamStatus({ hasLogin: true, onboarding: null });
    expect(s.label).toBe('Pending Onboarding');
    expect(s.detail).toMatch(/not started/);
    expect(s.tone).toBe('warning');
  });

  it('login created, onboarding partway → "Pending Onboarding" with progress', () => {
    const s = employeeTeamStatus({
      hasLogin: true,
      onboarding: { complete: false, stepsDone: 2, stepsTotal: 4 },
    });
    expect(s.label).toBe('Pending Onboarding');
    expect(s.detail).toMatch(/2\/4 steps/);
  });

  it('onboarding complete → "Active"', () => {
    const s = employeeTeamStatus({
      hasLogin: true,
      onboarding: { complete: true, stepsDone: 4, stepsTotal: 4 },
    });
    expect(s.label).toBe('Active');
    expect(s.tone).toBe('success');
  });
});

describe('inviteTeamStatus', () => {
  const now = new Date('2026-08-11T12:00:00Z');

  it('a live invite is "Pending" with honest login language and expiry', () => {
    const s = inviteTeamStatus({ expiresAt: '2026-08-14T12:00:00Z', now });
    expect(s.label).toBe('Pending');
    expect(s.detail).toMatch(/login not created yet/i);
    expect(s.detail).toMatch(/Expires in 3 days/);
  });

  it('a lapsed invite is "Expired" and points at resend', () => {
    const s = inviteTeamStatus({ expiresAt: '2026-08-10T12:00:00Z', now });
    expect(s.label).toBe('Expired');
    expect(s.kind).toBe('invite_expired');
    expect(s.detail).toMatch(/resend/i);
  });
});

describe('backend rules', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

  it('accept-invite activates the employee record in BOTH branches', () => {
    const src = read('supabase/functions/accept-invite/index.ts');
    // The link branch (pre-existing loginless/archived record) must flip the
    // record active, exactly like the create branch always did.
    const linkBranch = src.split('if (empRecord)')[1]?.split('} else {')[0] ?? '';
    expect(linkBranch).toContain('employment_status: "active"');
    const createBranch = src.split('} else {')[1] ?? '';
    expect(createBranch).toContain('employment_status: "active"');
  });

  it('resending an invite refreshes the expiry and reuses expired rows', () => {
    const src = read('supabase/functions/send-org-invite/index.ts');
    const dedupe = src.split('const { data: existing }')[1]?.split('maybeSingle()')[0] ?? '';
    // No liveness filter: an expired un-accepted invite is revived, not forked.
    expect(dedupe).not.toContain('gt("expires_at"');
    expect(dedupe).toContain('is("accepted_at", null)');
    // Every (re)send restarts the 7-day clock the email copy promises.
    expect(src).toMatch(/expires_at: new Date\(Date\.now\(\) \+ 7 \* 86_400_000\)/);
  });

  it('the resend hook sends the invite exactly as stored', () => {
    const src = read('src/hooks/usePendingInvites.ts');
    for (const field of ['operationalRole', 'secondaryRoles', 'startDate', 'initialPtoHours', 'schedule']) {
      expect(src).toContain(field);
    }
  });
});
