// Team membership status — one vocabulary for "where is this person in the
// join pipeline", used by the Team roster, the member profile row, and the
// pending-invites card. Pure functions of recorded data.
//
// The states, as the owner reads them:
//   Pending             — no login exists yet (an open invite, or a roster
//                         record that was never linked to an account)
//   Pending Onboarding  — login created (invite accepted) but the onboarding
//                         steps are not finished
//   Active              — onboarding complete
//   Expired             — the invite lapsed before a login was created

export type TeamStatusKind =
  | 'active'
  | 'pending_onboarding'
  | 'pending_login'
  | 'invite_expired';

export type TeamStatus = {
  kind: TeamStatusKind;
  label: string;
  detail: string;
  tone: 'success' | 'warning' | 'muted';
};

export type OnboardingSnapshot = {
  complete: boolean;
  /** Steps finished out of stepsTotal, when a record exists. */
  stepsDone: number;
  stepsTotal: number;
} | null;

/** Status for a person already on the employees roster. */
export function employeeTeamStatus(args: {
  hasLogin: boolean;
  onboarding: OnboardingSnapshot;
}): TeamStatus {
  if (!args.hasLogin) {
    return {
      kind: 'pending_login',
      label: 'Pending',
      detail: 'Login not created yet — invite them or resend the invite email.',
      tone: 'muted',
    };
  }
  if (args.onboarding?.complete) {
    return {
      kind: 'active',
      label: 'Active',
      detail: 'Onboarding complete.',
      tone: 'success',
    };
  }
  const progress =
    args.onboarding === null
      ? 'not started'
      : `${args.onboarding.stepsDone}/${args.onboarding.stepsTotal} steps`;
  return {
    kind: 'pending_onboarding',
    label: 'Pending Onboarding',
    detail: `Login created — onboarding ${progress}.`,
    tone: 'warning',
  };
}

/** Status for an open (un-accepted) invite row. */
export function inviteTeamStatus(args: { expiresAt: string; now?: Date }): TeamStatus {
  const now = args.now ?? new Date();
  const ms = new Date(args.expiresAt).getTime() - now.getTime();
  if (ms <= 0) {
    return {
      kind: 'invite_expired',
      label: 'Expired',
      detail: 'The invite lapsed before a login was created — resend to refresh it.',
      tone: 'muted',
    };
  }
  const days = Math.ceil(ms / 86_400_000);
  return {
    kind: 'pending_login',
    label: 'Pending',
    detail: `Invite sent — login not created yet. Expires in ${days} day${days === 1 ? '' : 's'}.`,
    tone: 'warning',
  };
}
