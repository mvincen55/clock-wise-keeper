import type { OcrBox, OcrWord, PhraseRule, LayoutColumn, ScheduleStatus, StatusLegendEntry } from './types';
import { classifyNote } from './note-classifier';
import { providerCodeCandidate, readProviderCodes } from './provider-codes';

export function sufficientStatusLegend(legend: Partial<Record<ScheduleStatus, StatusLegendEntry>>) {
  return !!legend.open && (!!legend.completed || !!legend.scheduled);
}

/** Posted visits and operational notes may share gray; color alone cannot establish completion. */
export function applyCompletedEvidence(statuses: Array<ScheduleStatus | null>, rows: Array<{yTop:number;yBottom:number}>, regions: OcrBox[], words: OcrWord[], col: LayoutColumn & {pxStart:number;pxEnd:number}, rules: PhraseRule[]) {
  return statuses.map((status,i) => {
    if(status !== 'completed') return status;
    const y=(rows[i].yTop+rows[i].yBottom)/2;
    const boxes=regions.filter(b=>b.x0>=col.pxStart-4 && b.x1<=col.pxEnd+4 && y>=b.y0 && y<b.y1);
    if(boxes.length!==1) return null;
    const b=boxes[0];
    const inside=words.filter(w=>w.bbox.x0>=b.x0-2 && w.bbox.x1<=b.x1+2 && w.bbox.y0>=b.y0-2 && w.bbox.y1<=b.y1+2);
    const note=classifyNote(inside.map(w=>w.text).join(' '),rules);
    const operational=note.code!=='UNCLASSIFIED' && note.confidence>=.8;
    const appointment=col.providerCode ? inside.some(w=>w.confidence>=40 && providerCodeCandidate(w.text)===col.providerCode) : readProviderCodes(inside).length===1;
    if(appointment && !operational) return 'completed';
    if(operational && !appointment) return 'blocked';
    return null;
  });
}
