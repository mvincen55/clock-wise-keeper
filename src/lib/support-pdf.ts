import jsPDF from 'jspdf';

export interface SupportPdfBubble {
  role: 'user' | 'assistant' | 'staff';
  content: string;
  tier?: string | null;
  attachments?: string[];
}

export interface SupportPdfInput {
  ticketId: string | null;
  pagePath: string;
  reporter: string;
  bubbles: SupportPdfBubble[];
  tier: 'standard' | 'senior';
  resolved: boolean;
}

const MARGIN = 48;
const LINE = 14;

const eastern = () =>
  new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** A plain, printable record of one support conversation. */
export function buildSupportPdf(input: SupportPdfInput): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const usable = width - MARGIN * 2;
  let y = MARGIN;

  const room = (need: number) => {
    if (y + need > height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const write = (text: string, size: number, style: 'normal' | 'bold', color: number[]) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, usable) as string[];
    for (const line of lines) {
      room(LINE);
      doc.text(line, MARGIN, y);
      y += LINE;
    }
  };

  write('Support conversation', 18, 'bold', [40, 34, 52]);
  y += 4;
  write(`Purple Envelope — exported ${eastern()} Eastern`, 9, 'normal', [110, 110, 120]);
  y += 8;

  const meta = [
    `Reported by: ${input.reporter}`,
    `Page: ${input.pagePath || 'unknown'}`,
    `Report ID: ${input.ticketId ?? 'not yet saved'}`,
    `Handled by: ${input.tier === 'senior' ? 'Senior agent' : 'Everyday agent'}`,
    `Status: ${input.resolved ? 'Closed out' : 'Open'}`,
  ];
  for (const m of meta) write(m, 10, 'normal', [60, 60, 70]);

  y += 10;
  room(LINE);
  doc.setDrawColor(210, 205, 215);
  doc.line(MARGIN, y, width - MARGIN, y);
  y += 16;

  const cited: string[] = [];

  for (const b of input.bubbles) {
    const who =
      b.role === 'user'
        ? input.reporter
        : b.tier === 'senior'
          ? 'Senior agent'
          : b.role === 'staff'
            ? 'Office'
            : 'Help desk';
    room(LINE * 2);
    write(who, 10, 'bold', b.role === 'user' ? [83, 64, 110] : [40, 40, 48]);
    write(b.content || '(no message)', 10, 'normal', [30, 30, 36]);
    if (b.attachments?.length) {
      for (const name of b.attachments) {
        cited.push(name);
        write(`Attached: ${name}`, 9, 'normal', [110, 110, 120]);
      }
    }
    y += 8;
  }

  if (cited.length) {
    y += 6;
    room(LINE * 3);
    doc.setDrawColor(210, 205, 215);
    doc.line(MARGIN, y, width - MARGIN, y);
    y += 16;
    write('Files referenced in this report', 12, 'bold', [40, 34, 52]);
    y += 2;
    cited.forEach((name, i) => write(`${i + 1}. ${name}`, 10, 'normal', [60, 60, 70]));
  }

  return doc;
}

export function downloadSupportPdf(input: SupportPdfInput) {
  const doc = buildSupportPdf(input);
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`support-report-${(input.ticketId ?? 'draft').slice(0, 8)}-${stamp}.pdf`);
}
