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
 * Plain-office-language explanation of what each quantity strategy actually
 * does to the charge. Shown in the metadata editor so managers configure
 * behavior, not database enums.
 */
export const QUANTITY_STRATEGY_EXPLANATIONS: Record<UnitType, string> = {
  per_tooth: 'Charge this code once for each selected tooth.',
  per_surface: 'Charge this code once for each treated surface.',
  per_quadrant: 'Charge this code once per quadrant — never once per tooth.',
  per_arch: 'Charge this code once per arch — never once per tooth.',
  per_visit: 'Charge this code once for the visit, even when multiple teeth are selected.',
  flat: 'One flat charge, regardless of teeth or surfaces.',
  manual: 'The team enters the quantity by hand every time this code is used.',
};

export type ProcedureMetaRules = {
  unitType: UnitType;
  quantityStrategy: UnitType;
  needsTeeth: boolean;
  needsSurfaces: boolean;
};

/**
 * The metadata invariants, shared by the editor UI, packet quantity math, and
 * tests — and mirrored word-for-word by the database trigger
 * enforce_procedure_meta_integrity (migration 20260806180000). Returns every
 * violated rule so an editor can show them all at once.
 */
export function validateProcedureMeta(rules: ProcedureMetaRules): string[] {
  const problems: string[] = [];
  if (rules.needsSurfaces && !rules.needsTeeth) {
    problems.push('Surface selection requires tooth selection.');
  }
  if (rules.quantityStrategy === 'per_surface' && !(rules.needsTeeth && rules.needsSurfaces)) {
    problems.push('A per-surface code must require teeth and surfaces.');
  }
  if (rules.quantityStrategy === 'per_tooth' && !rules.needsTeeth) {
    problems.push('A per-tooth code must require teeth.');
  }
  return problems;
}

/** Normalizes a code exactly the way the database does. */
export function normalizeProcedureCode(code: string): string {
  return code.trim().toUpperCase();
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
