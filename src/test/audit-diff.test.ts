import { describe, expect, it } from 'vitest';
import { diffAudit, describeDiff, fingerprintFindings, findingKey } from '@/lib/audit-diff';

const f = (issue: string, severity = 'high', where = 'Section 1') => ({
  severity,
  where,
  issue,
  conflicts_with: 'none',
  fix: 'fix it',
});

describe('audit fingerprint', () => {
  it('is order independent', () => {
    const a = fingerprintFindings([f('one'), f('two')], 'flagged');
    const b = fingerprintFindings([f('two'), f('one')], 'flagged');
    expect(a).toBe(b);
  });

  it('changes when the verdict changes', () => {
    expect(fingerprintFindings([f('one')], 'flagged')).not.toBe(
      fingerprintFindings([f('one')], 'clear')
    );
  });

  it('ignores whitespace and case in the key', () => {
    expect(findingKey(f('One  Issue'))).toBe(findingKey(f('one issue')));
  });
});

describe('diffAudit', () => {
  it('treats a module with no prior review as needing review', () => {
    const d = diffAudit({ verdict: 'flagged', findings: [f('one')] }, null);
    expect(d.firstReview).toBe(true);
    expect(d.needsReview).toBe(true);
    expect(d.added).toHaveLength(1);
  });

  it('does not require re-review when nothing changed', () => {
    const findings = [f('one'), f('two')];
    const prev = {
      fingerprint: fingerprintFindings(findings, 'flagged'),
      findings,
      verdict: 'flagged',
    };
    const d = diffAudit({ verdict: 'flagged', findings }, prev);
    expect(d.needsReview).toBe(false);
    expect(d.unchanged).toHaveLength(2);
    expect(describeDiff(d)).toMatch(/Nothing changed/);
  });

  it('flags new and resolved findings', () => {
    const before = [f('one'), f('two')];
    const prev = {
      fingerprint: fingerprintFindings(before, 'flagged'),
      findings: before,
      verdict: 'flagged',
    };
    const d = diffAudit({ verdict: 'flagged', findings: [f('two'), f('three')] }, prev);
    expect(d.needsReview).toBe(true);
    expect(d.added.map(x => x.issue)).toEqual(['three']);
    expect(d.resolved.map(x => x.issue)).toEqual(['one']);
    expect(d.unchanged.map(x => x.issue)).toEqual(['two']);
  });

  it('requires re-review when only the verdict changed', () => {
    const findings = [f('one')];
    const prev = {
      fingerprint: fingerprintFindings(findings, 'flagged'),
      findings,
      verdict: 'flagged',
    };
    const d = diffAudit({ verdict: 'unreviewed', findings }, prev);
    expect(d.verdictChanged).toBe(true);
    expect(d.needsReview).toBe(true);
  });
});
