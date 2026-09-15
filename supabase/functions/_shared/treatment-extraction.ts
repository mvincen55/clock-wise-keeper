export const INCOMPLETE_IMPORT_MESSAGE = 'The screenshot extraction is incomplete. Nothing was imported. Retry with a clearer screenshot containing at most 40 procedures; for larger plans, import non-overlapping batches and check the combined row count against the original.';

/** No salvage: even one malformed row makes the whole extraction incomplete. */
export function completeTreatmentRows(content: unknown, finishReason: unknown) {
  if (finishReason != null && finishReason !== 'stop') return null;
  if (typeof content !== 'string') return null;
  const raw = content.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 40) return null;
  const money = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
  if (!parsed.every(r => r && typeof r === 'object' &&
    typeof r.code === 'string' && r.code.trim() &&
    typeof r.tooth === 'string' && typeof r.description === 'string' &&
    typeof r.entryDate === 'string' && money(r.fee) && money(r.officeFee) &&
    (r.visit === null || (Number.isInteger(r.visit) && r.visit > 0)))) return null;
  return parsed.map(r => ({
    code: r.code.trim() as string, tooth: r.tooth.trim() as string,
    description: r.description.trim() as string, entryDate: r.entryDate.trim() as string,
    fee: r.fee > 0 ? r.fee as number : null,
    officeFee: r.officeFee > 0 ? r.officeFee as number : null,
    visit: r.visit as number | null,
  }));
}
