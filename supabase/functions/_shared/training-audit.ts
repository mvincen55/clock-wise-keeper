// Shared, side-effect-free normalisation of the training auditor's verdict.
// The model's raw JSON is untrusted: severities can be invented, findings can
// be missing, text can be unbounded. Nothing publishes unless the audit comes
// back explicitly clear.

export type AuditFinding = {
  severity: "high" | "medium" | "low";
  where: string;
  issue: string;
  conflicts_with: string;
  fix: string;
};

export type AuditResult = {
  verdict: "clear" | "flagged" | "unreviewed";
  summary: string;
  findings: AuditFinding[];
  audited_at: string;
  model?: string;
};

export const MAX_FINDINGS = 12;

export function boundedText(value: unknown, cap: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, cap) : "";
}

/** Auditor unreachable / unparseable → never publish, always hold as draft. */
export function unreviewedAudit(now: string, reason = "The auditor could not be reached."): AuditResult {
  return { verdict: "unreviewed", summary: reason, findings: [], audited_at: now };
}

export function normalizeFindings(raw: unknown): AuditFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const r = (f ?? {}) as Record<string, unknown>;
      const sev = boundedText(r.severity, 10).toLowerCase();
      return {
        severity: (["high", "medium", "low"].includes(sev) ? sev : "medium") as AuditFinding["severity"],
        where: boundedText(r.where, 200),
        issue: boundedText(r.issue, 700),
        conflicts_with: boundedText(r.conflicts_with, 700),
        fix: boundedText(r.fix, 700),
      };
    })
    .filter((f) => f.issue)
    .slice(0, MAX_FINDINGS);
}

export function normalizeAudit(
  parsed: unknown,
  opts: { now: string; model?: string }
): AuditResult {
  if (!parsed || typeof parsed !== "object") return unreviewedAudit(opts.now);
  const raw = parsed as Record<string, unknown>;
  const findings = normalizeFindings(raw.findings);
  const flagged = findings.length > 0 || boundedText(raw.verdict, 20) === "flagged";
  return {
    verdict: flagged ? "flagged" : "clear",
    summary: boundedText(raw.summary, 400),
    findings,
    audited_at: opts.now,
    model: opts.model,
  };
}

/** Only a clean audit publishes. Anything else waits for a human. */
export function statusForAudit(audit: Pick<AuditResult, "verdict">): "published" | "draft" {
  return audit.verdict === "clear" ? "published" : "draft";
}
