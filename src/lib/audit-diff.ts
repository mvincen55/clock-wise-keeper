// Comparing what the auditor said last time a human reviewed a module with
// what it says now. If anything changed, the module needs re-review before it
// can be published — an old sign-off never covers new findings.

export type DiffFinding = {
  severity: string;
  where: string;
  issue: string;
  conflicts_with?: string;
  fix?: string;
};

export type ReviewSnapshot = {
  /** Fingerprint of the findings the reviewer signed off on. */
  fingerprint: string;
  /** The findings themselves, so we can show a real before/after. */
  findings: DiffFinding[];
  verdict?: string;
  reviewed_at?: string;
  reviewed_by?: string;
};

/** Stable identity for one finding — severity + where + issue. */
export function findingKey(f: DiffFinding): string {
  return [f.severity ?? '', f.where ?? '', f.issue ?? '']
    .map(s => String(s).trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|');
}

/** Order-independent fingerprint of a whole set of findings. */
export function fingerprintFindings(findings: DiffFinding[] | null | undefined, verdict?: string) {
  const keys = (findings ?? []).map(findingKey).sort();
  return `${verdict ?? 'unknown'}::${keys.join('~')}`;
}

export type AuditDiff = {
  added: DiffFinding[];
  resolved: DiffFinding[];
  unchanged: DiffFinding[];
  verdictChanged: boolean;
  /** True when there is no prior review at all. */
  firstReview: boolean;
  /** True when a human must (re-)read before publishing. */
  needsReview: boolean;
};

export function diffAudit(
  current: { verdict?: string; findings?: DiffFinding[] | null } | null | undefined,
  previous: ReviewSnapshot | null | undefined
): AuditDiff {
  const nextFindings = current?.findings ?? [];
  const prevFindings = previous?.findings ?? [];
  const prevKeys = new Set(prevFindings.map(findingKey));
  const nextKeys = new Set(nextFindings.map(findingKey));

  const added = nextFindings.filter(f => !prevKeys.has(findingKey(f)));
  const resolved = prevFindings.filter(f => !nextKeys.has(findingKey(f)));
  const unchanged = nextFindings.filter(f => prevKeys.has(findingKey(f)));

  const firstReview = !previous?.fingerprint;
  const verdictChanged = !firstReview && (previous?.verdict ?? '') !== (current?.verdict ?? '');
  const changed =
    firstReview ||
    verdictChanged ||
    fingerprintFindings(nextFindings, current?.verdict) !== previous!.fingerprint;

  return { added, resolved, unchanged, verdictChanged, firstReview, needsReview: changed };
}

/** Plain-English one-liner for the preview header. */
export function describeDiff(diff: AuditDiff): string {
  if (diff.firstReview) return 'First review — nothing has been signed off yet.';
  if (!diff.needsReview) return 'Nothing changed since the last review.';
  const bits: string[] = [];
  if (diff.added.length) bits.push(`${diff.added.length} new`);
  if (diff.resolved.length) bits.push(`${diff.resolved.length} resolved`);
  if (diff.verdictChanged) bits.push('verdict changed');
  return bits.length
    ? `Findings changed since the last review — ${bits.join(', ')}.`
    : 'Findings changed since the last review.';
}
