/**
 * Factory checklists transcribed from the office's Drive sheets
 * ("Updated Clerical Checklist", "Assistant/Hyg Checklist", the OM
 * monthly/annual grids). Task names only — no staff initials or personal
 * assignments; per-person tasks use the perPerson flag instead. Seeded on
 * first use and fully editable afterward.
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
      { title: '"Front Desk" Events Completed', cadence: 'daily', perPerson: true },
      { title: 'Check Bathrooms, Waiting Room, and Outside Perimeter', cadence: 'daily' },
      { title: 'Complete Route Slips for 2 Days Out', cadence: 'daily' },
      { title: 'Call and/or Make any Patients Who Requested an Appt in RM', cadence: 'daily' },
      { title: 'Reminder Calls for 2 Days Out', cadence: 'daily' },
      { title: 'Verify Route Slips for Following Day / Upload & Resend HCF/HCU', cadence: 'daily' },
      { title: 'Run Payment Plans', cadence: 'daily' },
      { title: 'Run Ins / Visa CC', cadence: 'daily' },
      { title: 'Review All Patient Texts and Respond', cadence: 'daily' },
      { title: 'Print/Mail Delivery Claims', cadence: 'daily' },
      { title: "Batch All Today's Procedures and Send", cadence: 'daily' },
      { title: 'Complete Daily Deposit Bag/Packet', cadence: 'daily' },
      { title: 'Complete Day Sheet Packet', cadence: 'daily' },
      { title: 'Unscheduled Calls', cadence: 'weekly', perPerson: true },
      { title: 'Clear Out RM Tasks', cadence: 'weekly', perPerson: true },
      { title: 'Office Ordering / Inventory', cadence: 'weekly' },
      { title: 'Claims Not Attached Report', cadence: 'weekly' },
      { title: "PTE's (Scan, Enter, Add Cost to Appt and Call Patient)", cadence: 'weekly' },
      { title: 'Update Big Procedure List', cadence: 'weekly' },
      { title: 'Undeliverable Mail', cadence: 'weekly' },
      { title: 'Add HCF Dates for 2 Weeks Out into Ledger and Send', cadence: 'weekly' },
      { title: 'Sort Team Email & Upload Correspondence (Respond to Appt Requests)', cadence: 'weekly' },
      { title: 'Scanning', cadence: 'weekly' },
      { title: 'New Residence Letters', cadence: 'weekly' },
      { title: 'Descale Keurig (1st Week of the Month)', cadence: 'monthly' },
      { title: 'Move Documents to Attic (1st Week of the Month)', cadence: 'monthly' },
    ],
  },
  {
    name: 'Clinical — Assistant',
    audience: 'all',
    sortOrder: 1,
    items: [
      { title: 'Fill Ultrasonic, Statim and Autoclave', cadence: 'daily' },
      { title: 'Run Water Through Handpiece Lines / Handpiece Maintenance', cadence: 'daily' },
      { title: 'Run Air/Water Lines', cadence: 'daily' },
      { title: 'Wipe Composite off of Instruments', cadence: 'daily' },
      { title: 'Refill Burs', cadence: 'daily' },
      { title: 'Stock in Rooms', cadence: 'daily' },
      { title: 'Clean Steri, Lab, Impression Trays and Alginate', cadence: 'daily' },
      { title: 'Check Lab Cases for Following 2 Days', cadence: 'daily' },
      { title: 'Refill CaviCide Bottles', cadence: 'daily' },
      { title: 'Clean Rooms', cadence: 'daily' },
      { title: 'Log Out of Dentrix', cadence: 'daily' },
      { title: 'Run Suction (Vac-U-Sol)', cadence: 'daily' },
      { title: 'Close Cavi Wipe Lids', cadence: 'daily' },
      { title: 'Take Out Trash', cadence: 'daily' },
      { title: 'Confirm Suction & Compressor Are Off (if last one in the building)', cadence: 'daily' },
      { title: 'Box All Lab Cases', cadence: 'daily' },
      { title: 'Charting and Notes Completed for the Day', cadence: 'daily', perPerson: true },
      { title: 'PAN Turned Off', cadence: 'daily' },
      { title: 'Confirm All Cleaned Instruments Are Put Away', cadence: 'daily' },
      { title: 'Clean Traps', cadence: 'weekly' },
      { title: 'Spore Testing', cadence: 'weekly' },
      { title: 'Change/Charge Batteries on Curing Light (2x / week)', cadence: 'weekly' },
      { title: 'Order Supplies', cadence: 'weekly' },
      { title: 'Run Eye Water Station', cadence: 'weekly' },
      { title: 'Bring Lab Cases Downstairs', cadence: 'weekly' },
      { title: 'Reset IOS Laptop', cadence: 'weekly' },
      { title: 'Check Emergency Kit', cadence: 'monthly' },
      { title: 'Clean Autoclave', cadence: 'monthly' },
      { title: 'Check Filters Downstairs', cadence: 'monthly' },
      { title: 'Shock Water Bottles', cadence: 'monthly' },
      { title: 'Foil Test', cadence: 'monthly' },
      { title: 'Waterline Testing', cadence: 'monthly' },
      { title: 'Hazardous Waste Disposal', cadence: 'monthly' },
      { title: 'Radiation Log', cadence: 'monthly' },
      { title: 'Calibrate IOS Laptop', cadence: 'monthly' },
      { title: 'OSHA Training', cadence: 'yearly' },
      { title: 'Assistant License Renewal', cadence: 'yearly' },
      { title: 'HG5 Container', cadence: 'yearly' },
      { title: 'Change Straws in Bottle (Due March)', cadence: 'yearly' },
    ],
  },
  {
    name: 'Clinical — Hygiene',
    audience: 'all',
    sortOrder: 2,
    items: [
      { title: 'Stock Room', cadence: 'daily', perPerson: true },
      { title: 'Clean Room', cadence: 'daily', perPerson: true },
      { title: 'Log Out of Dentrix', cadence: 'daily', perPerson: true },
      { title: 'Run Suction (Vac-U-Sol)', cadence: 'daily', perPerson: true },
      { title: 'Check Your Instruments Midday', cadence: 'daily', perPerson: true },
      { title: 'Close Cavi Wipe Lids', cadence: 'daily' },
      { title: 'Take Out Trash', cadence: 'daily' },
      { title: 'Confirm Suction & Compressor Are Off (if last one in the building)', cadence: 'daily' },
      { title: 'Charting and Notes Completed for the Day', cadence: 'daily', perPerson: true },
      { title: 'Confirm PAN Is Off (if last one in the building)', cadence: 'daily' },
      { title: 'Confirm All Cleaned Instruments Are Put Away', cadence: 'daily' },
      { title: 'Clean Traps', cadence: 'weekly' },
    ],
  },
  {
    name: 'Manager',
    audience: 'manager',
    sortOrder: 3,
    items: [
      { title: 'Clear Out Emails', cadence: 'daily' },
      { title: 'Complete Scheduled Events', cadence: 'daily' },
      { title: 'Review Schedule for Following Day/Week', cadence: 'daily' },
      { title: 'Review PB for Following Day', cadence: 'daily' },
      { title: 'Patient Bills', cadence: 'weekly' },
      { title: 'Check "To Do" Spreadsheet', cadence: 'weekly' },
      { title: 'Team Records Updated', cadence: 'weekly' },
      { title: 'Review Time Off Requests', cadence: 'weekly' },
      { title: 'Check Clerical Checklist', cadence: 'weekly' },
      { title: 'Check DA/Hyg Checklist', cadence: 'weekly' },
      { title: 'Clear Out RM Tasks', cadence: 'weekly' },
      { title: 'Update Project Board', cadence: 'weekly' },
      { title: 'Update Numbers in Breakroom', cadence: 'weekly' },
      { title: 'Enter Checks', cadence: 'weekly' },
      { title: "Update 'Big Tx Plans'", cadence: 'weekly' },
      { title: 'Reply to All Google Reviews', cadence: 'weekly' },
      { title: 'Verify Clinical Notes Completed', cadence: 'weekly' },
      { title: 'Update OM Project Board', cadence: 'monthly' },
      { title: 'Review AP', cadence: 'monthly' },
      { title: 'Insurance Aging', cadence: 'monthly' },
      { title: 'Reconcile Lab Fees / Providers', cadence: 'monthly' },
      { title: 'Update Prod/Coll Figures', cadence: 'monthly' },
      { title: 'Reset Ins Benefits', cadence: 'monthly' },
      { title: 'Scan Invoices (QB)', cadence: 'monthly' },
      { title: 'Close Month (2 Months Out)', cadence: 'monthly' },
      { title: 'Social Media Posts', cadence: 'monthly' },
      { title: 'Monthly Report Meeting', cadence: 'monthly' },
      { title: 'Allocate Credit Balances', cadence: 'monthly' },
      { title: '"No Adjustments" Report', cadence: 'monthly' },
      { title: 'Verify Doctors Not Listed on Hyg Exams Report', cadence: 'monthly' },
      { title: 'Team Meeting Agenda', cadence: 'monthly' },
      { title: 'Pay Providers', cadence: 'monthly' },
      { title: 'New Resident Letters', cadence: 'monthly' },
      { title: 'Schedule Saturdays', cadence: 'yearly' },
      { title: 'Put Holidays on Schedule', cadence: 'yearly' },
      { title: 'Yearly Forms (Sexual Harassment, Team Agreement, etc.)', cadence: 'yearly' },
      { title: 'CPR Renewal Check', cadence: 'yearly' },
      { title: 'Schedule Staff Meetings', cadence: 'yearly' },
    ],
  },
];
