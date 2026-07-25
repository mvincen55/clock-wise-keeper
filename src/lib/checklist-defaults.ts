/**
 * Factory checklists — a generic dental-office starting point (front
 * desk, clinical assistant, hygiene, manager). Seeded on first use and
 * fully editable afterward; an office tailors names, items, and cadences
 * to its own routine. Task names only — no staff initials or personal
 * assignments; per-person tasks use the perPerson flag instead.
 */

export type ChecklistCadence = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface ChecklistItemSeed {
  title: string;
  cadence: ChecklistCadence;
  perPerson?: boolean;
}

export interface ChecklistSeed {
  name: string;
  audience: 'all' | 'manager';
  sortOrder: number;
  items: ChecklistItemSeed[];
}

export const DEFAULT_CHECKLISTS: ChecklistSeed[] = [
  {
    name: 'Clerical',
    audience: 'all',
    sortOrder: 0,
    items: [
      { title: 'Front desk opening tasks completed', cadence: 'daily', perPerson: true },
      { title: 'Check bathrooms, waiting room, and outside entrance', cadence: 'daily' },
      { title: 'Prepare route slips for 2 days out', cadence: 'daily' },
      { title: 'Call patients who requested an appointment', cadence: 'daily' },
      { title: 'Reminder calls for 2 days out', cadence: 'daily' },
      { title: 'Verify route slips for the following day', cadence: 'daily' },
      { title: 'Run scheduled payment plans', cadence: 'daily' },
      { title: 'Process insurance and patient card payments', cadence: 'daily' },
      { title: 'Review all patient texts and respond', cadence: 'daily' },
      { title: 'Print/mail outstanding claims', cadence: 'daily' },
      { title: "Batch and send today's procedures/claims", cadence: 'daily' },
      { title: 'Complete daily deposit', cadence: 'daily' },
      { title: 'Complete day sheet packet', cadence: 'daily' },
      { title: 'Unscheduled-patient calls', cadence: 'weekly', perPerson: true },
      { title: 'Clear out recall/task list', cadence: 'weekly', perPerson: true },
      { title: 'Office ordering / inventory', cadence: 'weekly' },
      { title: 'Claims-not-attached report', cadence: 'weekly' },
      { title: 'Pre-treatment estimates: scan, enter, and call patient', cadence: 'weekly' },
      { title: 'Update large-procedure tracking list', cadence: 'weekly' },
      { title: 'Process undeliverable mail', cadence: 'weekly' },
      { title: 'Sort team email and upload correspondence', cadence: 'weekly' },
      { title: 'Scanning', cadence: 'weekly' },
      { title: 'File/archive older documents (1st week of the month)', cadence: 'monthly' },
    ],
  },
  {
    name: 'Clinical — Assistant',
    audience: 'all',
    sortOrder: 1,
    items: [
      { title: 'Fill ultrasonic and sterilizers', cadence: 'daily' },
      { title: 'Run water through handpiece lines / handpiece maintenance', cadence: 'daily' },
      { title: 'Run air/water lines', cadence: 'daily' },
      { title: 'Wipe composite off instruments', cadence: 'daily' },
      { title: 'Refill burs', cadence: 'daily' },
      { title: 'Stock rooms', cadence: 'daily' },
      { title: 'Clean sterilization area, lab, and impression trays', cadence: 'daily' },
      { title: 'Check lab cases for the following 2 days', cadence: 'daily' },
      { title: 'Refill disinfectant bottles', cadence: 'daily' },
      { title: 'Clean rooms', cadence: 'daily' },
      { title: 'Log out of practice management software', cadence: 'daily' },
      { title: 'Run suction line cleaner', cadence: 'daily' },
      { title: 'Take out trash', cadence: 'daily' },
      { title: 'Confirm suction & compressor are off (if last one out)', cadence: 'daily' },
      { title: 'Box all outgoing lab cases', cadence: 'daily' },
      { title: 'Charting and notes completed for the day', cadence: 'daily', perPerson: true },
      { title: 'Pan/X-ray unit turned off', cadence: 'daily' },
      { title: 'Confirm all cleaned instruments are put away', cadence: 'daily' },
      { title: 'Clean traps', cadence: 'weekly' },
      { title: 'Spore testing', cadence: 'weekly' },
      { title: 'Charge/rotate curing light batteries', cadence: 'weekly' },
      { title: 'Order supplies', cadence: 'weekly' },
      { title: 'Run eyewash station', cadence: 'weekly' },
      { title: 'Check emergency kit', cadence: 'monthly' },
      { title: 'Clean autoclave', cadence: 'monthly' },
      { title: 'Shock waterline bottles', cadence: 'monthly' },
      { title: 'Sterilizer foil/efficacy test', cadence: 'monthly' },
      { title: 'Waterline testing', cadence: 'monthly' },
      { title: 'Hazardous waste disposal', cadence: 'monthly' },
      { title: 'Radiation log', cadence: 'monthly' },
      { title: 'Calibrate intraoral scanner', cadence: 'monthly' },
      { title: 'OSHA training', cadence: 'yearly' },
      { title: 'Assistant license renewals', cadence: 'yearly' },
      { title: 'Amalgam separator service', cadence: 'yearly' },
    ],
  },
  {
    name: 'Clinical — Hygiene',
    audience: 'all',
    sortOrder: 2,
    items: [
      { title: 'Stock room', cadence: 'daily', perPerson: true },
      { title: 'Clean room', cadence: 'daily', perPerson: true },
      { title: 'Log out of practice management software', cadence: 'daily', perPerson: true },
      { title: 'Run suction line cleaner', cadence: 'daily', perPerson: true },
      { title: 'Check your instruments midday', cadence: 'daily', perPerson: true },
      { title: 'Take out trash', cadence: 'daily' },
      { title: 'Confirm suction & compressor are off (if last one out)', cadence: 'daily' },
      { title: 'Charting and notes completed for the day', cadence: 'daily', perPerson: true },
      { title: 'Confirm pan/X-ray unit is off (if last one out)', cadence: 'daily' },
      { title: 'Confirm all cleaned instruments are put away', cadence: 'daily' },
      { title: 'Clean traps', cadence: 'weekly' },
    ],
  },
  {
    name: 'Manager',
    audience: 'manager',
    sortOrder: 3,
    items: [
      { title: 'Clear out emails', cadence: 'daily' },
      { title: 'Complete scheduled events', cadence: 'daily' },
      { title: 'Review schedule for the following day/week', cadence: 'daily' },
      { title: 'Patient bills', cadence: 'weekly' },
      { title: 'Review to-do list', cadence: 'weekly' },
      { title: 'Team records updated', cadence: 'weekly' },
      { title: 'Review time-off requests', cadence: 'weekly' },
      { title: 'Check clerical checklist', cadence: 'weekly' },
      { title: 'Check assistant/hygiene checklist', cadence: 'weekly' },
      { title: 'Enter checks', cadence: 'weekly' },
      { title: 'Update large treatment-plan tracking', cadence: 'weekly' },
      { title: 'Reply to all online reviews', cadence: 'weekly' },
      { title: 'Verify clinical notes completed', cadence: 'weekly' },
      { title: 'Review accounts payable', cadence: 'monthly' },
      { title: 'Insurance aging', cadence: 'monthly' },
      { title: 'Reconcile lab fees / providers', cadence: 'monthly' },
      { title: 'Update production/collection figures', cadence: 'monthly' },
      { title: 'Reset insurance benefits', cadence: 'monthly' },
      { title: 'Scan invoices into accounting', cadence: 'monthly' },
      { title: 'Close month', cadence: 'monthly' },
      { title: 'Social media posts', cadence: 'monthly' },
      { title: 'Monthly report meeting', cadence: 'monthly' },
      { title: 'Allocate credit balances', cadence: 'monthly' },
      { title: 'Adjustments report review', cadence: 'monthly' },
      { title: 'Team meeting agenda', cadence: 'monthly' },
      { title: 'Pay providers', cadence: 'monthly' },
      { title: 'Put holidays on the schedule', cadence: 'yearly' },
      { title: 'Annual HR forms and agreements', cadence: 'yearly' },
      { title: 'CPR renewal check', cadence: 'yearly' },
      { title: 'Schedule staff meetings', cadence: 'yearly' },
    ],
  },
];
