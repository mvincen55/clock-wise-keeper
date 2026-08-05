/**
 * Canonical procedure metadata model (procedure_meta). One per org + CDT code:
 * patient-friendly + internal description, unit type, teeth/surface rules,
 * quantity strategy, active flag, and search keywords. This is the single
 * source of truth used by FOF (patient-friendly name today) and the Forms
 * workflow (unit-aware quantities next).
 */

export const UNIT_TYPES = [
  'per_tooth',
  'per_surface',
  'per_quadrant',
  'per_arch',
  'per_visit',
  'flat',
  'manual',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  per_tooth: 'Per tooth',
  per_surface: 'Per surface',
  per_quadrant: 'Per quadrant',
  per_arch: 'Per arch',
  per_visit: 'Per visit',
  flat: 'Flat fee',
  manual: 'Manually entered',
};

export type ProcedureMeta = {
  id: string;
  orgId: string;
  code: string;
  patientName: string;
  internalDescription: string;
  unitType: UnitType;
  needsTeeth: boolean;
  needsSurfaces: boolean;
  quantityStrategy: UnitType;
  active: boolean;
  keywords: string[];
};

export function isUnitType(value: unknown): value is UnitType {
  return typeof value === 'string' && (UNIT_TYPES as readonly string[]).includes(value);
}

/**
 * Sensible defaults for teeth/surface requirements derived from a unit type.
 * Used to pre-fill new metadata rows; managers can still override.
 */
export function defaultRequirements(unitType: UnitType): { needsTeeth: boolean; needsSurfaces: boolean } {
  switch (unitType) {
    case 'per_surface':
      return { needsTeeth: true, needsSurfaces: true };
    case 'per_tooth':
      return { needsTeeth: true, needsSurfaces: false };
    default:
      return { needsTeeth: false, needsSurfaces: false };
  }
}

/**
 * How many billable units a set of teeth/surfaces represents under a strategy.
 * This is the primitive the Forms financial math will use so procedures are not
 * blindly multiplied by the number of teeth.
 */
export function computeQuantity(
  strategy: UnitType,
  input: { teeth?: number; surfaces?: number; quadrants?: number; arches?: number; manual?: number },
): number {
  const teeth = Math.max(0, input.teeth ?? 0);
  const surfaces = Math.max(0, input.surfaces ?? 0);
  const quadrants = Math.max(0, input.quadrants ?? 0);
  const arches = Math.max(0, input.arches ?? 0);
  switch (strategy) {
    case 'per_tooth':
      return Math.max(1, teeth);
    case 'per_surface':
      return Math.max(1, surfaces);
    case 'per_quadrant':
      return Math.max(1, quadrants);
    case 'per_arch':
      return Math.max(1, arches);
    case 'manual':
      return Math.max(1, Math.round(input.manual ?? 1));
    case 'per_visit':
    case 'flat':
    default:
      return 1;
  }
}
