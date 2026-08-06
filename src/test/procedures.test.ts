import { describe, it, expect } from 'vitest';
import {
  UNIT_TYPES,
  QUANTITY_STRATEGY_EXPLANATIONS,
  isUnitType,
  defaultRequirements,
  computeQuantity,
  validateProcedureMeta,
  normalizeProcedureCode,
} from '@/lib/procedures';

describe('unit types', () => {
  it('recognizes valid unit types', () => {
    for (const t of UNIT_TYPES) expect(isUnitType(t)).toBe(true);
    expect(isUnitType('per_eyeball')).toBe(false);
  });
});

describe('defaultRequirements', () => {
  it('per_surface needs teeth and surfaces', () => {
    expect(defaultRequirements('per_surface')).toEqual({ needsTeeth: true, needsSurfaces: true });
  });
  it('per_tooth needs teeth only', () => {
    expect(defaultRequirements('per_tooth')).toEqual({ needsTeeth: true, needsSurfaces: false });
  });
  it('per_visit needs neither', () => {
    expect(defaultRequirements('per_visit')).toEqual({ needsTeeth: false, needsSurfaces: false });
    expect(defaultRequirements('flat')).toEqual({ needsTeeth: false, needsSurfaces: false });
  });
});

describe('computeQuantity', () => {
  it('per_tooth counts teeth (never multiplies a per-visit code)', () => {
    expect(computeQuantity('per_tooth', { teeth: 2 })).toBe(2);
    // Two teeth entered on a per-visit code must NOT double the quantity.
    expect(computeQuantity('per_visit', { teeth: 2 })).toBe(1);
    expect(computeQuantity('flat', { teeth: 3 })).toBe(1);
  });
  it('per_surface counts surfaces', () => {
    expect(computeQuantity('per_surface', { surfaces: 3, teeth: 1 })).toBe(3);
  });
  it('per_quadrant and per_arch count their units', () => {
    expect(computeQuantity('per_quadrant', { quadrants: 2 })).toBe(2);
    expect(computeQuantity('per_arch', { arches: 1 })).toBe(1);
  });
  it('manual uses the entered quantity, min 1', () => {
    expect(computeQuantity('manual', { manual: 4 })).toBe(4);
    expect(computeQuantity('manual', { manual: 0 })).toBe(1);
  });
  it('unit strategies floor at 1 when nothing is entered', () => {
    expect(computeQuantity('per_tooth', {})).toBe(1);
    expect(computeQuantity('per_surface', {})).toBe(1);
  });
  it('per_quadrant and per_arch never multiply by raw tooth count', () => {
    expect(computeQuantity('per_quadrant', { quadrants: 2, teeth: 8 })).toBe(2);
    expect(computeQuantity('per_arch', { arches: 1, teeth: 14 })).toBe(1);
  });
});

describe('validateProcedureMeta (mirrors the DB trigger invariants)', () => {
  const base = { unitType: 'per_visit', quantityStrategy: 'per_visit', needsTeeth: false, needsSurfaces: false } as const;

  it('accepts a plain per-visit code', () => {
    expect(validateProcedureMeta({ ...base })).toEqual([]);
  });
  it('surfaces without teeth is rejected', () => {
    expect(validateProcedureMeta({ ...base, needsSurfaces: true })).toContain(
      'Surface selection requires tooth selection.',
    );
  });
  it('per_surface requires teeth and surfaces', () => {
    expect(
      validateProcedureMeta({ ...base, quantityStrategy: 'per_surface', needsTeeth: true, needsSurfaces: false }),
    ).toContain('A per-surface code must require teeth and surfaces.');
    expect(
      validateProcedureMeta({ ...base, quantityStrategy: 'per_surface', needsTeeth: true, needsSurfaces: true }),
    ).toEqual([]);
  });
  it('per_tooth requires teeth', () => {
    expect(validateProcedureMeta({ ...base, quantityStrategy: 'per_tooth' })).toContain(
      'A per-tooth code must require teeth.',
    );
    expect(
      validateProcedureMeta({ ...base, quantityStrategy: 'per_tooth', needsTeeth: true }),
    ).toEqual([]);
  });
  it('reports every violated rule at once', () => {
    const problems = validateProcedureMeta({
      ...base,
      quantityStrategy: 'per_surface',
      needsTeeth: false,
      needsSurfaces: true,
    });
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });
  it('every strategy has a plain-language explanation', () => {
    for (const t of UNIT_TYPES) {
      expect(QUANTITY_STRATEGY_EXPLANATIONS[t]).toBeTruthy();
    }
  });
});

describe('normalizeProcedureCode', () => {
  it('trims and uppercases exactly like the database', () => {
    expect(normalizeProcedureCode('  d2740 ')).toBe('D2740');
    expect(normalizeProcedureCode('9101a')).toBe('9101A');
  });
});
