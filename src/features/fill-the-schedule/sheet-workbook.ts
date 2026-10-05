import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Campaign, ScheduleSheet } from '@/lib/fill-the-schedule';
import { campaignDate } from './ui';

function xmlText(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);
}
/** Preserve the styled, paginated template and its four registration squares. */
export function personalizeSheetWorkbook(template: Uint8Array, sheet: ScheduleSheet, campaign: Campaign, officeName: string): Uint8Array {
  const tally = sheet.week_key === campaign.ends_on
    ? `Final tally through ${campaignDate(sheet.week_key)} · closes at midnight after December 31`
    : `Tally ending Friday ${campaignDate(sheet.week_key)}, ${sheet.week_key.slice(0, 4)} · 12:00 noon Eastern`;
  const replacements = { '__SHEET_CODE__': sheet.sheet_code, '__TALLY_LABEL__': tally, '__OFFICE_NAME__': officeName };
  const files = unzipSync(template);
  for (const name of Object.keys(files)) {
    if (!name.endsWith('.xml')) continue;
    let text = strFromU8(files[name]);
    for (const [key, value] of Object.entries(replacements)) text = text.split(key).join(xmlText(value));
    files[name] = strToU8(text);
  }
  return zipSync(files);
}

export async function downloadSheetWorkbook(sheet: ScheduleSheet, campaign: Campaign, officeName: string): Promise<void> {
  const response = await fetch(new URL('./front-desk-template.xlsx', import.meta.url));
  if (!response.ok) throw new Error('The spreadsheet could not be downloaded. Try again.');
  const bytes = personalizeSheetWorkbook(new Uint8Array(await response.arrayBuffer()), sheet, campaign, officeName);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a'); link.href = url; link.download = `Front_Desk_${sheet.sheet_code}.xlsx`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
