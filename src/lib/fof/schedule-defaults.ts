/**
 * Plan-specific toggle defaults that follow the carrier fee schedule staff
 * pick on the form. Office configuration only; nothing here reads patient data.
 */
export interface LinkedPlanLike { feeScheduleId?: string | null; officeFeesAfterMax?: boolean; isActive?: boolean }

/**
 * Whether "Reverts to office fees when maxed out" should switch on for a
 * carrier schedule: true when an active saved insurance plan linked to that
 * schedule says so, or when the schedule is Altus, the carrier the office
 * knows for it (it is the example on the toggle itself).
 */
export function revertsToOfficeFeesOnMax(
  scheduleId: string,
  scheduleName: string | undefined,
  plans: readonly LinkedPlanLike[] | undefined
): boolean {
  if ((plans ?? []).some(plan => plan.isActive !== false && plan.feeScheduleId === scheduleId && plan.officeFeesAfterMax === true)) return true;
  return /\baltus\b/i.test(scheduleName ?? '');
}
