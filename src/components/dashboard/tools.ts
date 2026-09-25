import type { Shortcut } from './types';

/**
 * The frequent tools that sit near the top of an owner's or manager's Home.
 * Existing routes only — this is a shortcut row, not a navigation system.
 * Every destination still guards itself (route + RLS).
 */
export const ADMIN_HOME_TOOLS: Shortcut[] = [
  { id: 'fof', label: 'Create FOF', to: '/fof', detail: 'Fee options form' },
  { id: 'fees', label: 'Fee schedules', to: '/fof/fees', detail: 'Office and carrier fees' },
  { id: 'close', label: 'Close the Day', to: '/deposit-log', detail: 'Money, vitals, seal' },
  { id: 'reports', label: 'Report history', to: '/report-history', detail: 'Load or read a package' },
];
