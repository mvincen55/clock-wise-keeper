import { describe, it, expect } from 'vitest';
import {
  normalizeAudit,
  normalizeFindings,
  statusForAudit,
  unreviewedAudit,
  MAX_FINDINGS,
} from '../../supabase/functions/_shared/training-audit';

const NOW = '2026-07-30T12:00:00.000Z';

describe('training auditor normalisation', () => {
  it('holds the module as a draft when the auditor is unreachable', () => {
    const audit = unreviewedAudit(NOW);
    expect(audit.verdict).toBe('unreviewed');
    expect(statusForAudit(audit)).toBe('draft');
  });

  it('holds the module when the model returns garbage', () => {
    expect(statusForAudit(normalizeAudit(null, { now: NOW }))).toBe('draft');
    expect(statusForAudit(normalizeAudit('not json', { now: NOW }))).toBe('draft');
  });

  it('publishes only on an explicitly clear verdict with no findings', () => {
    const audit = normalizeAudit(
      { verdict: 'clear', summary: 'Matches office rules.', findings: [] },
      { now: NOW, model: 'test-model' }
    );
    expect(audit.verdict).toBe('clear');
    expect(audit.model).toBe('test-model');
    expect(statusForAudit(audit)).toBe('published');
  });

  it('flags a module that has findings even if the verdict says clear', () => {
    const audit = normalizeAudit(
      { verdict: 'clear', findings: [{ severity: 'high', issue: 'Contradicts the PTO rule' }] },
      { now: NOW }
    );
    expect(audit.verdict).toBe('flagged');
    expect(statusForAudit(audit)).toBe('draft');
  });

  it('flags on the verdict alone when findings are missing', () => {
    const audit = normalizeAudit({ verdict: 'flagged' }, { now: NOW });
    expect(audit.verdict).toBe('flagged');
    expect(audit.findings).toEqual([]);
  });

  it('coerces invented severities to medium and drops findings with no issue', () => {
    const findings = normalizeFindings([
      { severity: 'catastrophic', issue: 'Invents a policy' },
      { severity: 'LOW', issue: 'Minor wording risk' },
      { severity: 'high', issue: '   ' },
      null,
    ]);
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe('medium');
    expect(findings[1].severity).toBe('low');
  });

  it('bounds text and the number of findings', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      severity: 'low',
      issue: `issue ${i} ` + 'x'.repeat(2000),
      where: 'y'.repeat(500),
    }));
    const findings = normalizeFindings(many);
    expect(findings).toHaveLength(MAX_FINDINGS);
    expect(findings[0].issue.length).toBeLessThanOrEqual(700);
    expect(findings[0].where.length).toBeLessThanOrEqual(200);
  });

  it('stamps the audit time it was given', () => {
    expect(normalizeAudit({ verdict: 'clear' }, { now: NOW }).audited_at).toBe(NOW);
  });
});
