/**
 * Patient-friendly names for common CDT codes, used for the printed
 * treatment description (practice-management exports use staff shorthand
 * like "CosPol"/"PABX" that patients can't read). Codes may come with or
 * without the leading D. Unknown codes fall back to the schedule's own
 * description.
 */
const NAMES: Record<string, string> = {
  // Diagnostic
  '0120': 'Periodic exam',
  '0140': 'Limited exam (problem-focused)',
  '0150': 'Comprehensive exam',
  '0210': 'Full-mouth X-rays',
  '0220': 'X-ray (single tooth)',
  '0230': 'X-ray (additional)',
  '0272': 'Bitewing X-rays (2)',
  '0274': 'Bitewing X-rays (4)',
  '0330': 'Panoramic X-ray',
  '0350': 'Oral photographs',
  '0367': 'CT scan',
  '0470': 'Diagnostic models',
  // Preventive
  '1110': 'Adult cleaning',
  '1120': 'Child cleaning',
  '1206': 'Fluoride varnish',
  '1208': 'Fluoride treatment',
  '1351': 'Sealant',
  '1354': 'Cavity-arresting treatment',
  '1510': 'Space maintainer',
  // Restorative — fillings
  '2140': 'Silver filling (1 surface)',
  '2150': 'Silver filling (2 surfaces)',
  '2160': 'Silver filling (3 surfaces)',
  '2161': 'Silver filling (4+ surfaces)',
  '2330': 'White filling (1 surface, front tooth)',
  '2331': 'White filling (2 surfaces, front tooth)',
  '2332': 'White filling (3 surfaces, front tooth)',
  '2335': 'White filling (4+ surfaces, front tooth)',
  '2391': 'White filling (1 surface)',
  '2392': 'White filling (2 surfaces)',
  '2393': 'White filling (3 surfaces)',
  '2394': 'White filling (4+ surfaces)',
  // Restorative — crowns & related
  '2510': 'Inlay',
  '2542': 'Onlay',
  '2740': 'Porcelain crown',
  '2750': 'Crown',
  '2752': 'Crown',
  '2790': 'Gold crown',
  '2920': 'Re-cement crown',
  '2930': 'Stainless steel crown (baby tooth)',
  '2940': 'Temporary filling',
  '2950': 'Core buildup',
  '2954': 'Post and core',
  '2960': 'Porcelain veneer (lab)',
  '2962': 'Porcelain veneer',
  // Endodontics
  '3110': 'Pulp cap',
  '3220': 'Pulpotomy',
  '3310': 'Root canal (front tooth)',
  '3320': 'Root canal (premolar)',
  '3330': 'Root canal (molar)',
  '3346': 'Root canal retreatment (front tooth)',
  '3347': 'Root canal retreatment (premolar)',
  '3348': 'Root canal retreatment (molar)',
  '3410': 'Root-end surgery (apicoectomy)',
  // Periodontics
  '4210': 'Gum surgery (gingivectomy, per quadrant)',
  '4211': 'Gum surgery (gingivectomy, 1-3 teeth)',
  '4240': 'Gum flap surgery',
  '4260': 'Bone surgery (per quadrant)',
  '4341': 'Deep cleaning (per quadrant)',
  '4342': 'Deep cleaning (1-3 teeth)',
  '4346': 'Cleaning with gum inflammation',
  '4355': 'Full-mouth debridement',
  '4381': 'Antibiotic gum treatment',
  '4910': 'Periodontal maintenance cleaning',
  '4265': 'Bio material',
  '4273': 'Gum tissue graft',
  '4277': 'Gum tissue graft (first tooth)',
  '4278': 'Gum tissue graft (additional tooth)',
  // Removable prosthodontics
  '5110': 'Complete upper denture',
  '5120': 'Complete lower denture',
  '5130': 'Immediate upper denture',
  '5140': 'Immediate lower denture',
  '5213': 'Upper partial denture',
  '5214': 'Lower partial denture',
  '5221': 'Upper partial denture (flexible)',
  '5222': 'Lower partial denture (flexible)',
  '5410': 'Denture adjustment (upper)',
  '5411': 'Denture adjustment (lower)',
  '5730': 'Denture reline (upper, in office)',
  '5731': 'Denture reline (lower, in office)',
  '5750': 'Denture reline (upper, lab)',
  '5751': 'Denture reline (lower, lab)',
  '5982': 'Surgical guide',
  // Implants
  '6010': 'Dental implant',
  '6011': 'Implant second-stage surgery',
  '6013': 'Mini implant placement',
  '6190': 'Surgical implant guide',
  '6196': 'Implant index/guide',
  '6056': 'Implant abutment (prefabricated)',
  '6057': 'Implant abutment (custom)',
  '6058': 'Implant crown (porcelain)',
  '6059': 'Implant crown',
  '6065': 'Implant crown (screw-retained)',
  '6110': 'Implant-supported upper denture',
  '6111': 'Implant-supported lower denture',
  '6114': 'Implant-supported fixed upper denture',
  '6115': 'Implant-supported fixed lower denture',
  // Fixed prosthodontics (bridges)
  '6240': 'Bridge tooth',
  '6245': 'Bridge tooth (porcelain)',
  '6740': 'Bridge crown (porcelain)',
  '6750': 'Bridge crown',
  '6930': 'Re-cement bridge',
  // Oral surgery
  '7140': 'Tooth extraction',
  '7210': 'Surgical tooth extraction',
  '7220': 'Impacted tooth removal (soft tissue)',
  '7230': 'Impacted tooth removal (partial bone)',
  '7240': 'Impacted tooth removal (full bone)',
  '7250': 'Root removal',
  '7953': 'Site preservation',
  // Adjunctive
  '9110': 'Emergency pain treatment',
  '9222': 'Deep sedation (first 15 min)',
  '9223': 'Deep sedation (additional 15 min)',
  '9230': 'Laughing gas (nitrous oxide)',
  '9310': 'Specialist consultation',
  '9944': 'Night guard (hard)',
  '9945': 'Night guard (soft)',
  '9946': 'Night guard (hard, partial)',
};

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'per', 'the', 'to', 'with',
]);

/** "porcelain crown" → "Porcelain Crown"; connector words stay lowercase. */
export function titleCase(text: string): string {
  return text.replace(/[A-Za-z]+(?:'[a-z]+)?/g, (word, offset: number) => {
    const prev = offset === 0 ? '' : text[offset - 1];
    const isPhraseStart = offset === 0 || prev === '(' || prev === '/';
    if (!isPhraseStart && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

export function friendlyCdtName(code: string): string | null {
  // Only D-prefixed codes are real CDT; bare numbers are custom office codes.
  const match = /^D(\d{4})$/i.exec(code.trim());
  if (!match) return null;
  const name = NAMES[match[1]];
  return name ? titleCase(name) : null;
}
