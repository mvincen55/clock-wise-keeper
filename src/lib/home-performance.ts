/**
 * The performance view model Home renders — one builder for the live hook
 * and the design-review fixtures, so the chart, the strip, the goal meters,
 * and the observations read the same rows through the same rules.
 *
 * Organization isolation: the rows carry the org they were read for, and
 * the builder returns null whenever that org is not the signed-in one, so a
 * cached window from a previous office can never render under a new one.
 */
import type { DayVitals, VitalsSummary, VitalsTargets, VitalsVisibility } from '@/hooks/usePracticeVitals';
import type { ReportImportRow } from '@/lib/report-history';
import { reportDaysFrom, reportPackagesFrom, type ReportPackage } from '@/lib/report-history';
import {
  availablePresets, earliestRecordedDay, type CloseoutDay, type PeriodPreset, type PerformanceSources, type SourceState,
} from '@/lib/performance-series';
import type { CloseoutMissedDay, MissedEventLite } from '@/lib/missed-trend';

export type NewPatientDay = { date: string; seen: number | null; scheduled: number | null };

export type PerformanceData = {
  orgId: string;
  today: string;
  /** Admins read report history and open management drilldowns; members get the shared scoreboard. */
  access: 'admin' | 'member';
  sources: PerformanceSources;
  packages: ReportPackage[];
  presets: PeriodPreset[];
  earliestRecorded: string | null;
  missedEvents: MissedEventLite[];
  missedState: SourceState;
  missedCloseouts: CloseoutMissedDay[];
  newPatients: NewPatientDay[];
  visibility: VitalsVisibility;
  /** This month's rollup and targets, for the new-patient tile and the goal meters. */
  thisMonth: VitalsSummary;
  targets: VitalsTargets;
  monthElapsed: number;
};

export type PerformanceRaw = {
  /** The org the rows were read for; compared against the viewer's org. */
  orgId: string;
  viewerOrgId: string;
  today: string;
  role: 'owner' | 'manager' | 'employee';
  days: DayVitals[];
  closeoutsState: SourceState;
  reports: ReportImportRow[] | null;
  reportState: SourceState;
  missedEvents: MissedEventLite[] | null;
  missedState: SourceState;
  visibility: VitalsVisibility;
  thisMonth: VitalsSummary;
  targets: VitalsTargets;
  monthElapsed: number;
};

export function closeoutDaysFrom(days: DayVitals[]): CloseoutDay[] {
  return days.map(d => ({
    date: d.date,
    productionCents: d.productionCents,
    collectionsCents: d.collectedCents,
    sealedAt: d.sealedAt ?? null,
  }));
}

export function missedCloseoutsFrom(days: DayVitals[]): CloseoutMissedDay[] {
  return days.map(d => ({
    date: d.date,
    recorded: d.missedAppointmentsRecorded !== false,
    hygieneCancellations: d.hygieneCancellations,
    hygieneNoShows: d.hygieneNoShows,
    doctorCancellations: d.doctorCancellations,
    doctorNoShows: d.doctorNoShows,
  }));
}

/**
 * Null when the rows belong to another office (or are still loading). A
 * member gets no report history whatever the cache holds: the builder does
 * not widen access to render a chart.
 */
export function performanceDataFrom(raw: PerformanceRaw): PerformanceData | null {
  if (raw.orgId !== raw.viewerOrgId) return null;
  const admin = raw.role === 'owner' || raw.role === 'manager';
  const reports = admin ? (raw.reports ?? []) : [];
  const sources: PerformanceSources = {
    closeouts: closeoutDaysFrom(raw.days),
    closeoutsState: raw.closeoutsState,
    reportDays: reportDaysFrom(reports),
    reportState: admin ? raw.reportState : 'unauthorized',
  };
  const earliest = earliestRecordedDay(sources);
  return {
    orgId: raw.orgId,
    today: raw.today,
    access: admin ? 'admin' : 'member',
    sources,
    packages: reportPackagesFrom(reports),
    presets: availablePresets(raw.today, earliest),
    earliestRecorded: earliest,
    missedEvents: admin ? (raw.missedEvents ?? []) : [],
    missedState: admin ? raw.missedState : 'unauthorized',
    missedCloseouts: missedCloseoutsFrom(raw.days),
    newPatients: raw.days.map(d => ({ date: d.date, seen: d.newPatientsSeen, scheduled: d.newPatientsScheduled })),
    visibility: raw.visibility,
    thisMonth: raw.thisMonth,
    targets: raw.targets,
    monthElapsed: raw.monthElapsed,
  };
}
