/**
 * Standing-rule relevance.
 *
 * Standing wording rules are global, but a code's edit dialog must only
 * present the ones that actually concern that procedure — showing a
 * surgical-guide rule against a crown implies a relationship that isn't
 * there.
 *
 * The three rules below are the office's real standing rules, and the
 * D2740 case is the one that exposed the problem: only the lab-work
 * Delivery rule belongs on a crown.
 */
import { describe, it, expect } from 'vitest';
import { partitionRulesByProcedure, procedureTerms } from '@/lib/fof/rule-relevance';

const DELIVERY_RULE =
  'Call receiving any finished lab-made piece "Delivery" (On Crown Delivery, On Denture Delivery, On Partial Delivery, On Implant Crown Delivery) — never "seating", "seat", "insertion", "placement", or "cementation".';
const GUIDE_RULE =
  'A surgical guide is never "delivered" — it is simply used on implant surgery day. Name a records/guide visit for what the patient experiences (e.g. "At the Records Visit"), never "Guide Delivery".';
const FILLING_RULE =
  'Describe fillings without surfaces or surface counts — just "a composite filling on tooth #3".';

const ALL = [DELIVERY_RULE, GUIDE_RULE, FILLING_RULE];

const partitionFor = (code: string, friendly: string | null, description: string) =>
  partitionRulesByProcedure(ALL, procedureTerms(code, friendly, description));

describe('D2740 porcelain crown — the reported case', () => {
  const { matching, others } = partitionFor('D2740', 'Porcelain crown', 'CrnAllCer');

  it('surfaces the lab-work Delivery rule, which names crowns', () => {
    expect(matching).toContain(DELIVERY_RULE);
  });

  it('does not surface the surgical-guide rule on a crown', () => {
    expect(matching).not.toContain(GUIDE_RULE);
    expect(others).toContain(GUIDE_RULE);
  });

  it('does not surface the fillings rule on a crown', () => {
    expect(matching).not.toContain(FILLING_RULE);
    expect(others).toContain(FILLING_RULE);
  });

  it('shows exactly one rule rather than all three', () => {
    expect(matching).toHaveLength(1);
    expect(others).toHaveLength(2);
  });
});

describe('other procedures match their own rules', () => {
  it('a denture matches the Delivery rule via "Denture Delivery"', () => {
    const { matching } = partitionFor('D5110', 'Complete upper denture', 'DentUpper');
    expect(matching).toContain(DELIVERY_RULE);
    expect(matching).not.toContain(FILLING_RULE);
  });

  it('a composite filling matches the fillings rule, not the crown rule', () => {
    const { matching } = partitionFor('D2391', 'Composite filling', 'Resin1S');
    expect(matching).toContain(FILLING_RULE);
    expect(matching).not.toContain(DELIVERY_RULE);
  });

  it('a surgical guide matches the guide rule', () => {
    const { matching } = partitionFor('D6190', 'Surgical guide', 'SurgGuide');
    expect(matching).toContain(GUIDE_RULE);
  });

  it('an unrelated procedure surfaces nothing, leaving all rules as global', () => {
    const { matching, others } = partitionFor('D0120', 'Periodic exam', 'PerExam');
    expect(matching).toHaveLength(0);
    expect(others).toHaveLength(3);
  });
});

describe('never loses a rule', () => {
  it('every rule lands in exactly one bucket', () => {
    for (const [code, friendly] of [
      ['D2740', 'Porcelain crown'],
      ['D0120', 'Periodic exam'],
      ['D5110', 'Complete upper denture'],
    ] as const) {
      const { matching, others } = partitionFor(code, friendly, '');
      expect(matching.length + others.length).toBe(ALL.length);
      expect(new Set([...matching, ...others]).size).toBe(ALL.length);
    }
  });

  it('treats all rules as global when the code has no usable terms', () => {
    const { matching, others } = partitionRulesByProcedure(ALL, procedureTerms('', null, ''));
    expect(matching).toHaveLength(0);
    expect(others).toEqual(ALL);
  });
});

describe('term extraction', () => {
  it('includes the code with and without the D prefix', () => {
    expect(procedureTerms('D2740', null, '')).toEqual(expect.arrayContaining(['d2740', '2740']));
  });

  it('drops generic words that would match nearly every rule', () => {
    // "tooth" appears in the fillings rule; matching on it would attach
    // that rule to every procedure.
    expect(procedureTerms('D2740', 'Crown on tooth', '')).not.toContain('tooth');
  });

  it('matches singular and plural forms of a name', () => {
    const terms = procedureTerms('D2740', 'Crowns', '');
    const { matching } = partitionRulesByProcedure([DELIVERY_RULE], terms);
    expect(matching).toContain(DELIVERY_RULE);
  });
});
