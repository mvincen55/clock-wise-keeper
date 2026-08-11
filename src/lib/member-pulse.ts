// Team-member office pulse — the deterministic layer behind the member Home.
//
// Same canonical facts as the owner and manager surfaces (owner-pulse.ts):
// nothing here recomputes a formula. What differs is FILTERING, not math:
//  - each metric appears only when its own visibility setting allows it for
//    regular members ('admin_only' omits it cleanly — no locked teaser);
//  - everything is office-level: no rankings, no per-person attribution,
//    no peer comparisons — production and collections are normal dental-office
//    performance numbers the whole team shares.
//
// The role-relevant pulse maps a person's OPERATIONAL role (their work, never
// their permission tier) to the office facts that role actually acts on.

import type { OperationalRole } from '@/lib/schedule-reader/types';
import type { VitalsVisibility } from '@/hooks/usePracticeVitals';
import {
  monthPaceLines,
  newPatientsSeenPace,
  type MonthPaceLine,
  type OwnerPulseInput,
  type PulseTone,
} from '@/lib/owner-pulse';

/**
 * The office scoreboard a member is allowed to see: the same MonthPaceLine
 * objects the owner and manager read, filtered by each metric's own
 * visibility. Returns an empty array for a brand-new office (no closeouts).
 */
export function memberOfficeLines(
  input: OwnerPulseInput,
  visibility: VitalsVisibility,
): MonthPaceLine[] {
  if (input.thisMonth.days === 0) return [];
  return monthPaceLines(input).filter(line =>
    line.id === 'production'
      ? visibility.production
      : line.id === 'collections'
        ? visibility.collections
        : visibility.newPatients,
  );
}

/** One role-relevant office fact. Office-level only, always linked to work. */
export type RolePulseItem = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  href?: string;
  tone: PulseTone;
};

/**
 * Office facts relevant to an operational role, from recorded vitals only.
 * Emphasis, not access: visibility settings still gate the financial lines
 * (handled by memberOfficeLines); these are operational counts.
 *
 * Front desk owns the new-patient pipeline, hygiene watches hygiene-side
 * schedule disruption, assisting and sterilization see nothing financial here
 * — their lane is checklists and readiness, which live elsewhere on Home.
 */
export function rolePulseItems(
  role: OperationalRole | null,
  input: OwnerPulseInput,
  visibility: VitalsVisibility,
): RolePulseItem[] {
  if (!role) return [];
  const { todayVitals, thisMonth } = input;
  const items: RolePulseItem[] = [];

  if (role === 'front_desk') {
    const scheduledToday = todayVitals?.newPatientsScheduled ?? null;
    items.push({
      id: 'np-scheduled',
      label: 'New patients scheduled',
      value:
        scheduledToday !== null
          ? `${scheduledToday} today`
          : `${input.scheduledThisWeek} this week`,
      detail:
        scheduledToday !== null
          ? `${input.scheduledThisWeek} this week · the pipeline you fill`
          : input.scheduledThisWeekRecordedDays > 0
            ? 'The pipeline you fill — today’s count arrives with Close the Day.'
            : 'Recorded at Close the Day — nothing entered yet this week.',
      href: '/deposit-log',
      tone: 'steady',
    });
    if (visibility.newPatients) {
      const pace = newPatientsSeenPace(input);
      if (pace) {
        items.push({
          id: 'np-seen-pace',
          label: 'New patients seen this month',
          value: String(pace.actual),
          detail: `Goal ${pace.target} · ${
            pace.status === 'on_pace'
              ? 'on pace'
              : `${Math.abs(pace.diff)} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} pace`
          } — completed first visits only.`,
          href: '/goals',
          tone: pace.status === 'behind' ? 'attention' : 'steady',
        });
      }
    }
    const missed = thisMonth.disruptions;
    if (missed > 0) {
      items.push({
        id: 'disruptions',
        label: 'Missed appointments this month',
        value: String(missed),
        detail: 'Confirmations and refills are the lever.',
        href: '/broken-appointments',
        tone: 'attention',
      });
    }
  }

  if (role === 'treatment_coordinator') {
    if (visibility.newPatients) {
      const pace = newPatientsSeenPace(input);
      if (pace) {
        items.push({
          id: 'np-seen-pace',
          label: 'New patients seen this month',
          value: String(pace.actual),
          detail: `Goal ${pace.target} · ${
            pace.status === 'on_pace'
              ? 'on pace'
              : `${Math.abs(pace.diff)} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} pace`
          } — completed first visits only.`,
          href: '/goals',
          tone: pace.status === 'behind' ? 'attention' : 'steady',
        });
      }
    }
    const missed = thisMonth.disruptions;
    if (missed > 0) {
      items.push({
        id: 'disruptions',
        label: 'Missed appointments this month',
        value: String(missed),
        detail: 'Rebooking broken treatment is the lever.',
        href: '/broken-appointments',
        tone: 'attention',
      });
    }
  }

  if (role === 'hygienist') {
    const hygieneMissed = thisMonth.hygieneCancellations + thisMonth.hygieneNoShows;
    items.push({
      id: 'hygiene-missed',
      label: 'Hygiene cancellations + no-shows this month',
      value: String(hygieneMissed),
      detail:
        thisMonth.days > 0
          ? `${thisMonth.hygieneCancellations} cancellation${thisMonth.hygieneCancellations === 1 ? '' : 's'} · ${thisMonth.hygieneNoShows} no-show${thisMonth.hygieneNoShows === 1 ? '' : 's'}`
          : 'Nothing recorded this month yet.',
      href: '/broken-appointments',
      tone: hygieneMissed > 0 ? 'attention' : 'calm',
    });
  }

  if (role === 'dentist') {
    const missed = thisMonth.disruptions;
    items.push({
      id: 'doctor-missed',
      label: 'Missed appointments this month',
      value: String(missed),
      detail: `${thisMonth.doctorCancellations + thisMonth.doctorNoShows} doctor-side · ${thisMonth.hygieneCancellations + thisMonth.hygieneNoShows} hygiene`,
      href: '/morning-huddle',
      tone: missed > 0 ? 'attention' : 'calm',
    });
  }

  return items;
}
