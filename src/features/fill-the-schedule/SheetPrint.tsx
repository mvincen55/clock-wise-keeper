import { createPortal } from 'react-dom';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFillSchedule } from '@/hooks/useFillSchedule';
import type { Campaign, ScheduleSheet } from '@/lib/fill-the-schedule';
import { SHEET_LAYOUT, SHEET_HEADERS } from './sheet-layout';
import { button, secondary, campaignDate } from './ui';
import './sheet-print.css';
import { downloadSheetWorkbook } from './sheet-workbook';

export function SheetPage({ sheet, campaign, officeName = 'Harelick Dental Associates LLC' }: { sheet: ScheduleSheet; campaign: Campaign; officeName?: string }) {
  const l = SHEET_LAYOUT;
  return <div className="fts-sheet-page" style={{ width: l.width, height: l.height }}>
    {[['nw', 10, 10], ['ne', 980, 10], ['sw', 10, 736], ['se', 980, 736]].map(([id, left, top]) => <span key={id} aria-hidden="true" className="fts-registration" style={{ left, top }} />)}
    <div className="fts-sheet-heading"><p className="fts-sheet-kicker">Q4 · FILL THE SCHEDULE</p><h1>Operative Treatment Scheduled Before Leaving</h1><p>{officeName} · {sheet.week_key === campaign.ends_on ? `Final tally through ${campaignDate(sheet.week_key)} · closes at midnight after December 31` : `Tally ending Friday ${campaignDate(sheet.week_key)}, ${sheet.week_key.slice(0, 4)} · 12:00 noon Eastern`}</p></div>
    <div className="fts-sheet-code"><strong>{sheet.sheet_code}</strong><span>Page 1 of 1</span></div>
    <ol className="fts-sheet-instructions"><li>One row per completed visit. Use a fresh sheet code for each new page.</li><li>Never write patient names, initials, chart numbers, appointment details, or amounts.</li><li>Credit to is the employee earning the handoff points. Booked by is the front-desk cross-check.</li><li>Use the app or this sheet once per action. If both were used, copy the app entry code so they can be linked.</li></ol>
    <table className="fts-sheet-table" style={{ left: l.left, top: l.tableTop, width: l.tableWidth }}>
      <colgroup>{l.columns.map((width, i) => <col key={i} style={{ width: `${width / l.columns.reduce((a, b) => a + b, 0) * 100}%` }} />)}</colgroup>
      <thead><tr style={{ height: l.headerHeight }}>{SHEET_HEADERS.map((text, i) => <th key={text} className={i >= 9 ? 'fts-manager-cell' : ''}>{text.split('\n').map((line, j) => <span key={j}>{line}</span>)}{i >= 9 && <small>Manager only</small>}</th>)}</tr></thead>
      <tbody>{Array.from({ length: 12 }, (_, i) => <tr key={i} style={{ height: l.rowHeight }}>
        <td className="fts-row-number">{i + 1}</td><td /><td /><td /><td /><td><span className="fts-check" /> Yes</td>
        <td className="fts-prepay-cell"><div><span className="fts-check fts-no" /><span className="fts-pay-label fts-no">None</span><span className="fts-check fts-yes" /><span className="fts-pay-label fts-yes">Yes</span></div><div className="fts-pay-time">Date ______ Time ______</div></td><td /><td />
        <td className="fts-manager-cell"><span className="fts-check" /><span className="fts-initials">Initials</span><span className="fts-initials-line" /></td>
        <td className="fts-manager-cell"><span className="fts-check" /><span className="fts-initials">Initials</span><span className="fts-initials-line" /></td><td className="fts-manager-cell" />
      </tr>)}</tbody>
    </table>
    <footer className="fts-sheet-footer"><p><strong>Shaded columns are the manager’s.</strong> Handoff = 2 points after checking the operative appointment. Actual prepayment = +2 after checking the payment. Verify separately. Empty verification boxes award no points.</p><div><span className="fts-check" /> Scheduling report checked <span className="fts-check" /> Sheet complete, ready to scan</div><p className="fts-sheet-reprint">Reprinting this code copies the same page. Use “Print blank sheet” in Purple Envelope to register a new page.</p></footer>
  </div>;
}
export default function SheetPrint() {
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const { sheetId } = useParams(); const { data: d, manager, isLoading, contextLoading, ctx } = useFillSchedule();
  if (isLoading || contextLoading) return <p className="p-6">Loading the sheet…</p>;
  if (!manager) return <p role="alert" className="p-6">This sheet is available to office managers.</p>;
  const sheet = d?.sheets?.find(s => s.id === sheetId);
  if (!d || !sheet || sheet.status !== 'open') return <div className="space-y-3 p-6"><p role="alert">This sheet is unavailable or has been voided.</p><Link to="/fill-the-schedule#review">Return to Review</Link></div>;
  async function download() { if (downloading) return; setDownloading(true); setDownloadError(''); try { await downloadSheetWorkbook(sheet!, d!.campaign, ctx?.org_name ?? 'Organization'); } catch { setDownloadError('The spreadsheet could not be downloaded. Try again.'); } finally { setDownloading(false); } }
  return <div className="space-y-5 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><Link className={secondary} to="/fill-the-schedule#review">Back to Review</Link><div className="flex gap-2"><button disabled={downloading} className={secondary} onClick={() => void download()}>{downloading ? 'Downloading…' : 'Download spreadsheet'}</button><button className={button} onClick={() => window.print()}>Print this sheet</button></div></div>{downloadError && <p role="alert">{downloadError}</p>}<p className="text-sm text-muted-foreground">Landscape letter · one page · {sheet.sheet_code}. Keep this code with the completed page when scanning.</p><div className="relative min-w-0 overflow-x-auto rounded-xl border bg-muted p-4"><SheetPage sheet={sheet} campaign={d.campaign} officeName={ctx?.org_name} /></div>{createPortal(<div className="fts-print-root"><SheetPage sheet={sheet} campaign={d.campaign} officeName={ctx?.org_name} /></div>, document.body)}</div>;
}
