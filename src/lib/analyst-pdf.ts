import jsPDF from 'jspdf';
import { formatDate } from '@/lib/time-utils';
import type { AnalystAudit, AnalystCitation, AnalystConcern } from '@/components/accountability/ReportsAnalyst';

const CITE = /\[rec:([0-9a-fA-F-]{6,})\]/g;

const CONF_LABEL: Record<AnalystConcern['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

/** Replace [rec:id] tokens with a human label so the print copy reads plainly. */
function inlineCites(text: string, byId: Map<string, AnalystCitation>) {
  return text.replace(CITE, (_m, id: string) => {
    const c = byId.get(id);
    return c ? `(${c.who}, ${formatDate(c.period_start)})` : `(record #${String(id).slice(0, 8)})`;
  });
}

export interface AnalystPdfInput {
  from: string;
  to: string;
  kindLabel: string;
  recordCount: number;
  answer: string;
  citations: AnalystCitation[];
  concerns: AnalystConcern[];
  audit?: AnalystAudit;
}

export function buildAnalystPdf(input: AnalystPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const M = 54;
  const W = doc.internal.pageSize.getWidth() - M * 2;
  const H = doc.internal.pageSize.getHeight();
  let y = M;

  const need = (h: number) => {
    if (y + h > H - M) {
      doc.addPage();
      y = M;
    }
  };

  const text = (
    s: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    doc.setFontSize(size);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const [r, g, b] = opts.color ?? [40, 40, 44];
    doc.setTextColor(r, g, b);
    const indent = opts.indent ?? 0;
    const lines = doc.splitTextToSize(s, W - indent) as string[];
    for (const line of lines) {
      need(size + 4);
      doc.text(line, M + indent, y);
      y += size + 3;
    }
    y += opts.gap ?? 4;
  };

  const rule = () => {
    need(12);
    doc.setDrawColor(220, 218, 226);
    doc.line(M, y, M + W, y);
    y += 12;
  };

  const byId = new Map(input.citations.map(c => [c.id, c]));

  // Header
  doc.setFillColor(83, 64, 110);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 8, 'F');
  y = M;
  text('Record Analyst Summary', { size: 18, bold: true, color: [83, 64, 110], gap: 2 });
  text(
    `${formatDate(input.from)} - ${formatDate(input.to)}  ·  ${input.kindLabel}  ·  ${input.recordCount} record${input.recordCount === 1 ? '' : 's'}`,
    { size: 10, color: [110, 108, 118], gap: 2 },
  );
  text(`Generated ${formatDate(new Date().toISOString().slice(0, 10))} · Purple Envelope`, {
    size: 9,
    color: [140, 138, 148],
  });
  rule();

  // Totals
  const byPerson = new Map<string, number>();
  const byKind = new Map<string, number>();
  for (const c of input.citations) {
    byPerson.set(c.who, (byPerson.get(c.who) ?? 0) + 1);
    byKind.set(c.kind_label, (byKind.get(c.kind_label) ?? 0) + 1);
  }
  const openCount = input.citations.filter(c => c.status !== 'closed').length;

  text('Totals', { size: 13, bold: true, color: [83, 64, 110], gap: 2 });
  text(`Records in range: ${input.recordCount}`, { indent: 10, gap: 0 });
  text(`Records cited by the analyst: ${input.citations.length}`, { indent: 10, gap: 0 });
  text(`Still open / not closed: ${openCount}`, { indent: 10, gap: 0 });
  text(`Concerns flagged: ${input.concerns.length}`, { indent: 10 });

  if (byKind.size) {
    text('By category', { size: 11, bold: true, gap: 2 });
    for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1])) {
      text(`• ${k}: ${n}`, { indent: 10, gap: 0 });
    }
    y += 4;
  }
  if (byPerson.size) {
    text('By person', { size: 11, bold: true, gap: 2 });
    for (const [p, n] of [...byPerson].sort((a, b) => b[1] - a[1])) {
      text(`• ${p}: ${n}`, { indent: 10, gap: 0 });
    }
    y += 4;
  }
  rule();

  // Patterns / narrative
  text('What the analyst found', { size: 13, bold: true, color: [83, 64, 110], gap: 2 });
  for (const raw of input.answer.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^[-*•]\s+/.test(line);
    const heading = /^#+\s/.test(line) || /^\*\*.+\*\*$/.test(line);
    const clean = inlineCites(
      line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/, '').replace(/^[-*•]\s+/, ''),
      byId,
    );
    text(bullet ? `• ${clean}` : clean, {
      bold: heading,
      indent: bullet ? 10 : 0,
      gap: heading ? 3 : 1,
    });
  }
  y += 4;

  // Concerns
  if (input.concerns.length) {
    rule();
    text('Flagged concerns', { size: 13, bold: true, color: [83, 64, 110], gap: 2 });
    input.concerns.forEach((c, i) => {
      need(60);
      text(`${i + 1}. ${c.title}`, { size: 11, bold: true, gap: 1 });
      text(`${CONF_LABEL[c.confidence]}${c.confidence_reason ? ` — ${c.confidence_reason}` : ''}`, {
        size: 9,
        color: [110, 108, 118],
        indent: 10,
        gap: 3,
      });
      text('Supports this', { size: 9, bold: true, indent: 10, gap: 1 });
      if (!c.supports.length) text('—', { size: 9, indent: 20, gap: 1 });
      for (const s of c.supports) text(`• ${inlineCites(s, byId)}`, { size: 9, indent: 20, gap: 0 });
      y += 3;
      text('Weakens this', { size: 9, bold: true, indent: 10, gap: 1 });
      if (!c.weakens.length) text('—', { size: 9, indent: 20, gap: 1 });
      for (const s of c.weakens) text(`• ${inlineCites(s, byId)}`, { size: 9, indent: 20, gap: 0 });
      y += 8;
    });
  }

  // Audit
  if (input.audit) {
    rule();
    text('Independent audit', { size: 13, bold: true, color: [83, 64, 110], gap: 2 });
    if (input.audit.verdict === 'unavailable') {
      text('Auditor unavailable — this answer was not double-checked.', { size: 9, color: [110, 108, 118] });
    } else if (input.audit.verdict === 'clean') {
      text(`Audited — ${input.audit.summary}`, { size: 9, color: [110, 108, 118] });
    } else {
      text(
        `Auditor flagged ${input.audit.issues.length} claim${input.audit.issues.length === 1 ? '' : 's'}. ${input.audit.summary ?? ''}`,
        { size: 9, color: [150, 40, 40], gap: 3 },
      );
      input.audit.issues.forEach((iss, i) => {
        text(`${i + 1}. "${iss.claim}"`, { size: 9, indent: 10, gap: 1 });
        text(`${iss.type}${iss.severity === 'high' ? ' (serious)' : ''}: ${iss.problem}`, {
          size: 9,
          color: [110, 108, 118],
          indent: 20,
          gap: 4,
        });
      });
    }
  }

  // Records appendix
  if (input.citations.length) {
    rule();
    text('Records cited', { size: 13, bold: true, color: [83, 64, 110], gap: 2 });
    for (const c of input.citations) {
      need(34);
      text(`${c.who} · ${c.kind_label} · ${formatDate(c.period_start)} - ${formatDate(c.period_end)}`, {
        size: 9,
        bold: true,
        gap: 1,
      });
      text(c.summary, { size: 9, color: [110, 108, 118], indent: 10, gap: 1 });
      text(`Record ${c.id} · ${c.status.replace(/_/g, ' ')}`, {
        size: 7.5,
        color: [150, 148, 158],
        indent: 10,
        gap: 6,
      });
    }
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 148, 158);
    doc.text(
      'Documentation, not punishment — the record says what happened.',
      M,
      H - 28,
    );
    doc.text(`${p} / ${pages}`, M + W, H - 28, { align: 'right' });
  }

  return doc;
}
