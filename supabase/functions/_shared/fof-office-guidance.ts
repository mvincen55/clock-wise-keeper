import { fofRuleNeedsReview } from './fof-privacy.ts';

export interface GuidanceSource {
  id: string;
  code: string;
  description: string;
  notes: string;
  scheduleId: string;
}
export interface OfficeRecipe {
  sourceId: string;
  scheduleId: string;
  code: string;
  title: string;
  summary: string;
  classification: 'workup' | 'implant' | 'restoration' | 'denture' | 'other' | 'review';
  grouping: 'same_tooth' | 'same_visit' | 'separate';
}
export interface OfficeGuidance {
  revision: string;
  recipes: OfficeRecipe[];
  warnings: string[];
}

/** The client supplies only office identity. Never accept a patient/code subset,
 * name, question, screenshot, visit, tooth, amount, or current-form context. */
export function guidanceRequest(value: unknown): { orgId: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.orgId === 'string' &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.orgId)
    ? { orgId: body.orgId } : null;
}

const classes = ['workup', 'implant', 'restoration', 'denture', 'other', 'review'];
const grouping = ['same_tooth', 'same_visit', 'separate'];
const clinicalWords = new Set('implant implants crown crowns surgery surgical restoration restorative dental treatment work up workup records imaging examination exam evaluation consultation scan scans digital guided guide abutment abutments custom supported porcelain ceramic zirconia bridge bridges denture dentures partial upper lower full complete immediate removable fixed overdenture repair reline rebase impression impressions preparation delivery try in extraction extractions bone graft grafting regeneration tissue membrane sinus lift socket preservation periodontal scaling root planing cleaning prophylaxis hygiene maintenance filling fillings composite amalgam buildup core post endodontic canal therapy whitening bleaching veneer veneers sealant fluoride night guard occlusal appliance orthodontic aligner retainer splint splinting oral evaluation radiograph radiographs x ray rays diagnostic temporary provisional and with without for of'.split(' '));
export const isClinicalTitle = (value: string) => /^[a-z &/-]+$/i.test(value) && value.toLowerCase().split(/[\s&/-]+/).filter(Boolean).every(word => clinicalWords.has(word));
const clean = (value: unknown, limit: number): value is string => typeof value === 'string' &&
  value.trim().length > 0 && value.length <= limit && !fofRuleNeedsReview(value);

/** Every suggestion must cite a real office code-bank row. The model cannot
 * manufacture codes, fees, percentages, tooth numbers, schedules, or patients. */
export function readOfficeRecipes(value: unknown, sources: GuidanceSource[]): OfficeRecipe[] {
  if (!Array.isArray(value) || value.length > sources.length) throw new Error('Invalid guidance');
  const seen = new Set<string>();
  return value.map(raw => {
    const source = sources.find(s => s.id === raw?.sourceId);
    if (!source || seen.has(source.id) || typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 70 || !isClinicalTitle(raw.title) || !clean(raw.summary, 240) ||
      !classes.includes(raw.classification) || !grouping.includes(raw.grouping) || /[#\d$%]/.test(raw.title)) {
      throw new Error('Invalid guidance');
    }
    seen.add(source.id);
    return { sourceId: source.id, scheduleId: source.scheduleId, code: source.code,
      title: raw.title.trim(), summary: raw.summary.trim(), classification: raw.classification, grouping: raw.grouping };
  });
}
