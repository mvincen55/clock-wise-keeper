/**
 * Factory onboarding template — ONE generic dental front-desk starting
 * point, seeded on first visit to the builder and fully editable afterward.
 * Deliberately generic: no office names, no system brands beyond "your
 * practice management system", no local policies — the office layers its
 * own "how we do it here" on top. Task names only; business/employment
 * content only (never patient data).
 */

export interface OnboardingItemSeed {
  title: string;
  detail?: string;
}

export interface OnboardingSectionSeed {
  title: string;
  items: OnboardingItemSeed[];
}

export interface OnboardingTemplateSeed {
  name: string;
  roleLabel: string;
  sections: OnboardingSectionSeed[];
}

export const GENERIC_FRONT_DESK_TEMPLATE: OnboardingTemplateSeed = {
  name: 'Front Desk Onboarding (starter)',
  roleLabel: 'Front Desk',
  sections: [
    {
      title: 'First-Day Paperwork',
      items: [
        { title: 'Employment forms completed and returned' },
        { title: 'Payroll and direct deposit set up' },
        { title: 'Emergency contact on file' },
        { title: 'Name tag, keys/codes, and parking arranged' },
      ],
    },
    {
      title: 'Safety & Compliance',
      items: [
        { title: 'Office safety walkthrough', detail: 'Exits, fire extinguisher, first-aid kit, eyewash station.' },
        { title: 'OSHA basics reviewed for a non-clinical role' },
        { title: 'HIPAA privacy basics reviewed', detail: 'What can and cannot be said at the desk, on the phone, and in writing.' },
        { title: 'Incident reporting: what to report and how' },
      ],
    },
    {
      title: 'Office Policies',
      items: [
        { title: 'Handbook received and key policies reviewed' },
        { title: 'Schedule, breaks, and time-off request process' },
        { title: 'Dress code and phone/personal device policy' },
        { title: 'Time clock: clocking in and out, and fixing a missed punch' },
      ],
    },
    {
      title: 'Systems & Tools',
      items: [
        { title: 'Practice management system: sign-in and navigation' },
        { title: 'Phones: answering, transferring, and taking messages' },
        { title: 'Appointment book: reading the day at a glance' },
        { title: 'Where supplies, forms, and the office directory live' },
      ],
    },
    {
      title: 'Core Training',
      items: [
        { title: 'Greeting and checking in a patient' },
        { title: 'Scheduling, rescheduling, and confirming appointments' },
        { title: 'Answering common insurance questions', detail: 'What to say, what to look up, and who to hand off to.' },
        { title: 'Collecting payments and giving receipts' },
        { title: 'Handling a broken appointment the office way' },
      ],
    },
    {
      title: 'Daily Duties',
      items: [
        { title: 'Opening duties walked through and performed together' },
        { title: 'Daily checklist: where it lives and how completion works' },
        { title: 'Closing duties walked through and performed together' },
        { title: 'End-of-day money: the deposit log and who verifies it' },
      ],
    },
    {
      title: 'Reviews',
      items: [
        { title: 'End of week one: questions answered, early feedback both ways' },
        { title: '30-day review completed' },
        { title: '60-day review completed' },
        { title: '90-day review completed' },
      ],
    },
  ],
};

/** Seed only into an empty library — never beside existing org content. */
export function shouldSeedTemplates(existingTemplateCount: number): boolean {
  return existingTemplateCount === 0;
}
