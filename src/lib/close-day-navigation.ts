import { getToday } from '@/lib/time-utils';

export function closingDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return getToday();
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) && value <= getToday()
    ? value : getToday();
}

export const scheduleSetupUrl = (date: string) =>
  `/settings/schedule-intelligence?closingDate=${closingDate(date)}`;

export const scheduleReturnUrl = (date: string) =>
  `/deposit-log?date=${closingDate(date)}&step=2`;
