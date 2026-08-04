/**
 * Role-based SMART starters. These are coaching prompts, never rules — a member
 * can ignore them entirely and write the goal in their own words.
 */
export type RoleKey =
  | 'front_desk'
  | 'assistant'
  | 'hygienist'
  | 'provider'
  | 'billing'
  | 'manager';

export type GoalIdea = { title: string; target: string };

export type RolePreset = {
  key: RoleKey;
  label: string;
  ideas: GoalIdea[];
  /** Short measurable targets that fit this role, for one-tap picking. */
  targets: string[];
};

export const ROLE_PRESETS: RolePreset[] = [
  {
    key: 'front_desk',
    label: 'Front desk',
    ideas: [
      {
        // Office policy confirms two days ahead (matches the 48-business-hour
        // notice window in Broken Appointments) — not the day before.
        title:
          'Confirm every appointment two days ahead by 4pm each workday this month so the schedule stays full',
        target: '100% of appointments confirmed two days out',
      },
      {
        title:
          'Reschedule every cancellation before the patient leaves the phone, at least 8 times this month',
        target: '8 same-call reschedules',
      },
      {
        title:
          'Clear the unscheduled treatment list by calling 5 patients a week for the whole month',
        target: '20 recall calls',
      },
    ],
    targets: [
      '100% two-day-out confirmations',
      '8 same-call reschedules',
      '20 recall calls',
      '5 reviews requested',
    ],
  },
  {
    key: 'assistant',
    label: 'Dental assistant',
    ideas: [
      {
        title:
          'Have every operatory fully set up 10 minutes before each patient this month',
        target: 'Rooms ready 10 min early, every patient',
      },
      {
        title:
          'Learn and independently set up for 3 new procedures this month with a checkoff from the doctor',
        target: '3 procedures signed off',
      },
      {
        title: 'Cut average room turnover to under 7 minutes by the end of the month',
        target: 'Turnover under 7 minutes',
      },
    ],
    targets: [
      '3 procedures signed off',
      'Rooms ready 10 min early',
      'Turnover under 7 minutes',
      '4 sterilization audits passed',
    ],
  },
  {
    key: 'hygienist',
    label: 'Hygienist',
    ideas: [
      {
        title:
          'Pre-appoint every hygiene patient for their next recall before they leave this month',
        target: '95% pre-appointed',
      },
      {
        title:
          'Use the teach-back method on home care with every patient and note it in the chart, all month',
        target: 'Teach-back noted on every chart',
      },
      {
        title:
          'Identify and hand off 10 perio candidates to the doctor with photos this month',
        target: '10 perio handoffs',
      },
    ],
    targets: [
      '95% pre-appointed',
      '10 perio handoffs',
      'Teach-back on every chart',
      '12 intraoral photo sets',
    ],
  },
  {
    key: 'provider',
    label: 'Doctor / provider',
    ideas: [
      {
        title:
          'Present treatment with photos and a written plan for every case over $1,000 this month',
        target: 'Photos + written plan on every large case',
      },
      {
        title: 'Finish chart notes the same day for every patient this month',
        target: 'Same-day notes, 100% of days',
      },
      {
        title: 'Run a 10-minute morning huddle every workday this month',
        target: '20 huddles led',
      },
    ],
    targets: [
      'Same-day notes 100% of days',
      '20 huddles led',
      '10 case presentations with photos',
      '2 team trainings taught',
    ],
  },
  {
    key: 'billing',
    label: 'Billing / insurance',
    ideas: [
      {
        title: 'Get every claim submitted within 24 hours of the visit this month',
        target: '100% of claims out in 24 hours',
      },
      {
        title: 'Work the over-60-day aging report down to under $5,000 by month end',
        target: 'Over-60 aging under $5,000',
      },
      {
        title: 'Verify insurance benefits 48 hours ahead for every new patient this month',
        target: '100% verified 48 hours ahead',
      },
    ],
    targets: [
      '100% claims out in 24 hours',
      'Over-60 aging under $5,000',
      '15 appeals resubmitted',
      '100% benefits verified early',
    ],
  },
  {
    key: 'manager',
    label: 'Office manager',
    ideas: [
      {
        title: 'Hold a 15-minute one-on-one with every team member this month',
        target: 'One-on-one with all team members',
      },
      {
        title: 'Close out every open checklist bypass within 2 business days this month',
        target: 'All bypasses closed in 2 days',
      },
      {
        title: 'Write and publish 4 training modules for the team this month',
        target: '4 modules published',
      },
    ],
    targets: [
      'One-on-one with everyone',
      '4 modules published',
      'All bypasses closed in 2 days',
      '4 weekly huddles run',
    ],
  },
];

/** Generic measurable nudges shown before a role is picked. */
export const GENERIC_TARGETS = [
  'X times this month',
  '4 times a week',
  '100% of the time',
  'By the last workday',
];
