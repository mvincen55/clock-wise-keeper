// The privacy terms every team member signs before the app opens.
//
// Bump PRIVACY_TERMS_DOCUMENT when the wording changes — everyone re-signs on
// their next login, because an acknowledgment is per document version.

export const PRIVACY_TERMS_DOCUMENT = 'privacy_terms_v1';

export type TermsSection = {
  heading: string;
  body: string[];
};

export const PRIVACY_TERMS: TermsSection[] = [
  {
    heading: 'Your privacy',
    body: [
      'Purple Envelope never shares your private data with your owner or manager. That means your messages, your conversations with the office AI, your quiz answers, the questions you answer about how you work, and your sticky notes.',
      "And as a company, we don't read it either. It is yours.",
    ],
  },
  {
    heading: 'What the system watches',
    body: [
      'The system watches security and data-integrity events only: sign-in attempts, tamper signals, attempts to misuse the AI, and record-level anomalies — like a deposit log being changed after close-out.',
      'It never reads your messages.',
      'When something serious is flagged, the owner and your manager are emailed and notified — unless the person flagged is a manager, in which case only the owner is notified.',
      'A human reviews every flag before anything happens. A flag is a question, not a verdict.',
    ],
  },
];

export const PRIVACY_TERMS_ACKNOWLEDGMENT =
  "I've read and understand this.";
