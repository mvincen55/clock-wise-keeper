import {
  makeBlock,
  type ConsentBlock,
  type ConsentTemplateContent,
  type FormCategory,
  type BundleItemRequirement,
} from './types';

/**
 * Sample library: realistic starter templates and bundles so Forms &
 * Consents is testable the moment it ships. Every sample is flagged
 * `is_sample` and badged "Sample — review before clinical use" until the
 * office edits and republishes it. Content is generic dental wording —
 * no office identity, no patient information.
 */

export const SAMPLE_REVIEW_NOTE = 'Sample content — review and edit before clinical use.';

export interface SampleTemplate {
  key: string;
  name: string;
  category: FormCategory;
  procedureCodes: string[];
  isFinancial?: boolean;
  hygienistMayComplete?: boolean;
  build: () => ConsentTemplateContent;
}

// Shorthand builders keep the sample definitions readable.
const title = (label: string) => makeBlock('title', { label });
const section = (label: string, kind: ConsentBlock['kind'], body?: string) =>
  makeBlock('section', { label, kind, body });
const para = (body: string) => makeBlock('paragraph', { body });
const bullets = (...items: string[]) => makeBlock('bullets', { items });
const instruction = (body: string) => makeBlock('instruction', { body });
const patientLine = () => makeBlock('patient_name', { label: 'Patient Name', required: true });
const dateLine = () => makeBlock('date', { label: 'Date', required: true });
const teeth = () => makeBlock('tooth_numbers', { label: 'Tooth Number(s)', required: true });
const provider = () => makeBlock('provider', { label: 'Treating Provider' });
const sig = (role: ConsentBlock['role'], required = true) => makeBlock('signature', { role, required });
const initials = (label: string) => makeBlock('initials', { label, required: true });
const consentClose = (statement: string): ConsentBlock[] => [
  section('Consent', 'consent_statement', statement),
  makeBlock('yesno', { label: 'I have had the opportunity to ask questions, and my questions were answered to my satisfaction.', required: true }),
  patientLine(),
  sig('patient'),
  dateLine(),
];

const RISK_INTRO =
  'As with any procedure, there are risks. Reviewing them with your provider is part of informed consent.';

export const SAMPLE_TEMPLATES: SampleTemplate[] = [
  {
    key: 'general',
    name: 'General Treatment Consent',
    category: 'general_consent',
    procedureCodes: [],
    build: () => ({
      blocks: [
        title('Consent for General Dental Treatment'),
        section('Description of Treatment', 'description',
          'I authorize the doctor and the clinical team to perform the dental treatment that has been explained to me, including examinations, radiographs, cleanings, fillings, and other routine procedures.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Temporary soreness or sensitivity after treatment',
          'Reaction to local anesthetic, including temporary numbness',
          'The need for additional or alternative treatment found during the procedure',
        ),
        section('Alternatives', 'alternatives',
          'Alternatives, including no treatment, have been explained to me along with their risks and benefits.'),
        ...consentClose('I have read and understand this consent, and I authorize the treatment described above.'),
      ],
    }),
  },
  {
    key: 'extraction',
    name: 'Tooth Extraction Consent',
    category: 'surgical_consent',
    procedureCodes: ['D7140', 'D7210'],
    build: () => ({
      blocks: [
        title('Consent for Tooth Extraction'),
        patientLine(),
        teeth(),
        provider(),
        section('Procedure Description', 'description',
          'An extraction is the removal of a tooth that cannot be predictably saved, or that you have elected not to save. Local anesthetic is used; some extractions require sectioning the tooth or smoothing the surrounding bone.'),
        section('Expected Benefits', 'benefits',
          'Removal of the source of pain or infection and prevention of damage to neighboring teeth.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Bleeding, swelling, bruising, and discomfort for several days',
          'Dry socket, which can delay healing and require additional visits',
          'Infection requiring antibiotics or further treatment',
          'Root tips, bone fragments, or adjacent restorations may be affected',
        ),
        section('Serious but Less Common Risks', 'serious_risks',
          'Numbness of the lip, chin, or tongue that is usually temporary but can be prolonged; sinus involvement for upper back teeth; jaw stiffness or, rarely, jaw fracture.'),
        section('Alternatives', 'alternatives',
          'Root canal therapy, periodontal treatment, or no treatment. Declining extraction of an infected tooth can allow the infection to spread.'),
        section('Consequences of Declining Treatment', 'declining',
          'Pain, swelling, spread of infection, and damage to other teeth may occur if the recommended extraction is not completed.'),
        makeBlock('page_break'),
        initials('I understand that once a tooth is removed it cannot be replaced except with artificial substitutes.'),
        ...consentClose('I consent to the extraction of the tooth or teeth listed above, and to any additional procedures the provider finds necessary for my safety during treatment.'),
        sig('doctor'),
      ],
    }),
  },
  {
    key: 'bone-graft',
    name: 'Bone Graft / Socket Preservation Consent',
    category: 'surgical_consent',
    procedureCodes: ['D7953', 'D4263'],
    build: () => ({
      blocks: [
        title('Consent for Bone Grafting'),
        patientLine(),
        teeth(),
        section('Procedure Description', 'description',
          'Bone graft material is placed into an extraction site or an area of bone loss to preserve or rebuild the ridge, most often in preparation for an implant or to support neighboring teeth. A membrane may be placed over the graft.'),
        section('Expected Benefits', 'benefits',
          'Preservation of bone volume, improved implant success, and better support for future restorations.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Swelling, bruising, and discomfort at the surgical site',
          'Small granules of graft material working loose during early healing',
          'Partial loss of graft volume requiring a second graft',
        ),
        section('Serious but Less Common Risks', 'serious_risks',
          'Infection of the graft site, membrane exposure, sinus involvement in the upper jaw, and failure of the graft to integrate.'),
        section('Alternatives', 'alternatives',
          'Healing without a graft (which may limit future implant options), or alternative restorations such as bridges or partial dentures.'),
        makeBlock('page_break'),
        makeBlock('yesno', { label: 'Graft material options (allograft, xenograft, synthetic) were discussed with me.', required: true }),
        ...consentClose('I consent to bone graft placement as described, including the graft material discussed with my provider.'),
        sig('doctor'),
      ],
    }),
  },
  {
    key: 'srp',
    name: 'Scaling and Root Planing Consent',
    category: 'periodontal',
    procedureCodes: ['D4341', 'D4342'],
    hygienistMayComplete: true,
    build: () => ({
      blocks: [
        title('Consent for Scaling and Root Planing'),
        patientLine(),
        section('Procedure Description', 'description',
          'Scaling and root planing is a deep cleaning below the gumline that removes plaque and tartar from the root surfaces to treat periodontal (gum) disease. Local anesthetic may be used for comfort.'),
        section('Expected Benefits', 'benefits',
          'Reduced gum inflammation and bleeding, reduced pocket depths, and slowed progression of periodontal disease.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Temporary tooth sensitivity to cold, and gum tenderness',
          'Gum recession as inflammation resolves',
          'The need for re-treatment or referral to a periodontist',
        ),
        section('Consequences of Declining Treatment', 'declining',
          'Untreated periodontal disease typically progresses, leading to bone loss, loose teeth, and eventually tooth loss.'),
        ...consentClose('I consent to scaling and root planing as described, understanding that periodontal disease requires ongoing maintenance.'),
      ],
    }),
  },
  {
    key: 'sonic',
    name: 'Sonic / Ultrasonic Instrumentation Consent',
    category: 'periodontal',
    procedureCodes: ['D4346', 'D1110'],
    hygienistMayComplete: true,
    build: () => ({
      blocks: [
        title('Consent for Sonic and Ultrasonic Instrumentation'),
        patientLine(),
        section('Procedure Description', 'description',
          'Sonic and ultrasonic instruments use rapid vibration and water irrigation to remove plaque, tartar, and stain efficiently and comfortably during your cleaning.'),
        section('Common Risks', 'risks',
          'Some patients notice temporary sensitivity or gum tenderness. The fine water spray means this method may be deferred for patients with certain respiratory conditions — tell us about any health changes.'),
        makeBlock('yesno', { label: 'Have there been any changes to your medical history since your last visit?', required: true }),
        ...consentClose('I consent to the use of sonic or ultrasonic instrumentation during my hygiene care.'),
      ],
    }),
  },
  {
    key: 'root-canal',
    name: 'Root Canal Treatment Consent',
    category: 'endodontic',
    procedureCodes: ['D3310', 'D3320', 'D3330'],
    build: () => ({
      blocks: [
        title('Consent for Root Canal (Endodontic) Treatment'),
        patientLine(),
        teeth(),
        provider(),
        section('Procedure Description', 'description',
          'Root canal treatment removes inflamed or infected pulp from inside the tooth, cleans and shapes the canals, and seals them so the tooth can be kept rather than extracted.'),
        section('Expected Benefits', 'benefits',
          'Relief of pain and infection while keeping your natural tooth.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Soreness for several days after treatment',
          'The tooth becoming brittle over time — a crown is usually recommended',
          'Blocked, curved, or extra canals that can limit success',
        ),
        section('Serious but Less Common Risks', 'serious_risks',
          'Instrument separation within a canal, root fracture, perforation, or persistent infection requiring retreatment, root-end surgery, or extraction.'),
        section('Alternatives', 'alternatives',
          'Extraction (with or without replacement) or no treatment. An infected tooth left untreated can cause serious swelling and spread of infection.'),
        makeBlock('page_break'),
        initials('I understand a separate crown or restoration is usually needed after root canal treatment and is not included in this procedure.'),
        ...consentClose('I consent to root canal treatment on the tooth listed above, including additional canals or medications found necessary during care.'),
        sig('doctor'),
      ],
    }),
  },
  {
    key: 'crown',
    name: 'Crown / Fixed Restoration Consent',
    category: 'restorative',
    procedureCodes: ['D2740', 'D2750'],
    build: () => ({
      blocks: [
        title('Consent for Crown or Fixed Restoration'),
        patientLine(),
        teeth(),
        section('Procedure Description', 'description',
          'The tooth is shaped, an impression or scan is taken, and a custom crown is made to restore the tooth. A temporary crown protects the tooth while the final restoration is fabricated.'),
        section('Expected Benefits', 'benefits',
          'Protection of a weakened tooth, restored function, and improved appearance.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Sensitivity after preparation, usually temporary',
          'Temporary crowns can loosen or break — call us if this happens',
          'A small percentage of crowned teeth later need root canal treatment',
          'Final shade and shape are matched as closely as materials allow',
        ),
        section('Alternatives', 'alternatives',
          'Large fillings or onlays where appropriate, extraction, or no treatment. A cracked or heavily filled tooth left untreated may fracture beyond repair.'),
        ...consentClose('I consent to the crown or fixed restoration described above and understand the laboratory fee is committed once the tooth is prepared.'),
      ],
    }),
  },
  {
    key: 'implant',
    name: 'Dental Implant Consent',
    category: 'implant',
    procedureCodes: ['D6010', 'D6056', 'D6058'],
    build: () => ({
      blocks: [
        title('Consent for Dental Implant Placement'),
        patientLine(),
        teeth(),
        provider(),
        section('Procedure Description', 'description',
          'A dental implant is a titanium post placed into the jawbone to replace a missing tooth root. After a healing period during which the bone bonds to the implant, an abutment and crown are attached.'),
        section('Expected Benefits', 'benefits',
          'A fixed replacement tooth that preserves bone and does not rely on neighboring teeth.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Swelling, bruising, and discomfort after surgery',
          'A healing period of several months before the final crown',
          'Implants require excellent home care and regular maintenance visits',
        ),
        section('Serious but Less Common Risks', 'serious_risks',
          'Implant failure to integrate (removal and possible re-placement), infection, nerve involvement causing lip or chin numbness, and sinus involvement in the upper jaw. Smoking and uncontrolled diabetes significantly raise the risk of failure.'),
        section('Alternatives', 'alternatives',
          'A fixed bridge, a removable partial denture, or no replacement. Each option was discussed, including cost and longevity differences.'),
        makeBlock('page_break'),
        initials('I understand implant success cannot be guaranteed, and that the restorative phase (abutment and crown) is a separate procedure and fee.'),
        ...consentClose('I consent to implant placement as described, including bone grafting if found necessary at the time of surgery and discussed with me.'),
        sig('doctor'),
      ],
    }),
  },
  {
    key: 'sedation',
    name: 'Sedation Consent',
    category: 'sedation',
    procedureCodes: ['D9230', 'D9243'],
    build: () => ({
      blocks: [
        title('Consent for Sedation'),
        patientLine(),
        section('Procedure Description', 'description',
          'Sedation (nitrous oxide or oral/IV sedation as discussed) is used to keep you relaxed and comfortable during treatment. You will be monitored throughout your appointment.'),
        section('Common Risks', 'risks', RISK_INTRO),
        bullets(
          'Drowsiness, nausea, or headache after the appointment',
          'Reduced coordination — you must not drive for the rest of the day after oral or IV sedation',
          'Partial memory of the appointment',
        ),
        section('Serious but Less Common Risks', 'serious_risks',
          'Allergic reaction, breathing difficulty, or deeper sedation than intended. Emergency equipment and trained staff are present whenever sedation is used.'),
        instruction('For oral or IV sedation: no food for 6 hours before your appointment, and a responsible adult must drive you home.'),
        makeBlock('yesno', { label: 'I have arranged for a responsible adult to accompany me home.', required: true }),
        makeBlock('page_break'),
        makeBlock('medications', {
          label: 'Current medications reviewed (select all that apply)',
          items: ['Blood thinners', 'Blood pressure medication', 'Diabetes medication', 'Sedatives or sleep aids', 'None of these'],
        }),
        ...consentClose('I consent to the sedation discussed with my provider and confirm the medical history I provided is complete and accurate.'),
        sig('doctor'),
      ],
    }),
  },
  {
    key: 'denture',
    name: 'Denture Expectations Consent',
    category: 'restorative',
    procedureCodes: ['D5110', 'D5120', 'D5213'],
    build: () => ({
      blocks: [
        title('Denture Expectations and Consent'),
        patientLine(),
        section('What to Expect', 'description',
          'Dentures restore appearance and function, but they are prosthetic replacements — not new natural teeth. Adapting to new dentures takes several weeks of practice with speaking and eating.'),
        section('Common Adjustments', 'risks',
          'Sore spots are normal with new dentures and are corrected with adjustment visits. Several adjustments are expected and included for the first months.'),
        bullets(
          'Lower dentures have less suction than uppers and may need adhesive or implant support',
          'Your bite and fit will change over time as the ridge remodels — relines are a normal part of denture ownership',
          'Dentures can break if dropped; keep them in water when not worn',
        ),
        section('Alternatives', 'alternatives',
          'Implant-supported overdentures or fixed implant bridges provide better stability and were discussed as alternatives.'),
        makeBlock('yesno', { label: 'I understand relines and future replacements are separate fees.', required: true }),
        ...consentClose('I understand the expectations above and consent to denture fabrication.'),
      ],
    }),
  },
  {
    key: 'financial',
    name: 'Financial Agreement',
    category: 'financial',
    procedureCodes: [],
    isFinancial: true,
    build: () => ({
      blocks: [
        title('Treatment Financial Agreement'),
        patientLine(),
        dateLine(),
        makeBlock('procedure', { label: 'Planned Treatment', required: true }),
        makeBlock('cost', { label: 'Treatment Fees', required: true }),
        section('Payment Terms', 'other',
          'Payment is due at the time of service unless other arrangements are made in advance. Insurance estimates are estimates only — the final patient portion depends on what your plan actually pays.'),
        bullets(
          'Estimated insurance payments are not a guarantee of coverage',
          'Any balance remaining after insurance pays is the patient’s responsibility',
          'Returned payments and accounts past 90 days may incur additional fees',
        ),
        makeBlock('short_answer', { label: 'Payment arrangement (if any)' }),
        initials('I understand the fees listed are for the planned treatment above, and that changes found during treatment may change the fee after discussion with me.'),
        ...consentClose('I have reviewed the fees for my planned treatment and agree to the payment terms above.'),
      ],
    }),
  },
  {
    key: 'postop',
    name: 'Postoperative Instructions',
    category: 'postoperative',
    procedureCodes: ['D7140', 'D7210', 'D6010'],
    build: () => ({
      blocks: [
        title('After Your Procedure — Care Instructions'),
        section('First 24 Hours', 'postop'),
        bullets(
          'Bite on gauze for 30–45 minutes; replace as needed until oozing stops',
          'Do not rinse, spit forcefully, use a straw, or smoke today',
          'Apply an ice pack 15 minutes on / 15 minutes off for swelling',
          'Eat soft, cool foods and stay hydrated',
        ),
        section('The Following Days', 'postop'),
        bullets(
          'Begin gentle warm salt-water rinses the day after your procedure',
          'Brush and floss normally, avoiding the surgical site for the first few days',
          'Swelling peaks around day 2–3, then improves',
        ),
        instruction('Call the office immediately for heavy bleeding, worsening pain after day 3, fever, or a bad taste that does not resolve — these can be signs of infection or dry socket.'),
        makeBlock('provider', { label: 'If you need us after hours, call the office number and follow the prompts.' }),
        sig('patient', false),
      ],
    }),
  },
  {
    key: 'medication',
    name: 'Medication Instructions',
    category: 'medication',
    procedureCodes: [],
    build: () => ({
      blocks: [
        title('Medication Instructions'),
        patientLine(),
        section('Medications Prescribed Today', 'other'),
        makeBlock('medications', {
          label: 'Prescribed (select all that apply)',
          items: [
            'Antibiotic — take the full course, even if you feel better',
            'Ibuprofen — take with food; do not exceed the labeled daily maximum',
            'Acetaminophen — do not combine with other acetaminophen products',
            'Prescription pain medication — no driving or alcohol while taking',
            'Chlorhexidine rinse — rinse twice daily; do not swallow',
          ],
        }),
        section('Important', 'other',
          'Tell us about any allergies or reactions. Stop the medication and call the office for rash, swelling, or difficulty breathing — call 911 for severe reactions.'),
        makeBlock('yesno', { label: 'I received and understand these medication instructions.', required: true }),
        sig('patient', false),
        dateLine(),
      ],
    }),
  },
];

export interface SampleBundleItem {
  templateKey: string;
  requirement: BundleItemRequirement;
  conditionLabel?: string;
}

export interface SampleBundle {
  name: string;
  description: string;
  procedureCodes: string[];
  items: SampleBundleItem[];
}

export const SAMPLE_BUNDLES: SampleBundle[] = [
  {
    name: 'Extraction Bundle',
    description: 'Everything for an extraction visit, with graft consent when planned.',
    procedureCodes: ['D7140', 'D7210'],
    items: [
      { templateKey: 'extraction', requirement: 'required' },
      { templateKey: 'bone-graft', requirement: 'conditional', conditionLabel: 'Socket preservation or bone graft planned?' },
      { templateKey: 'postop', requirement: 'recommended' },
      { templateKey: 'medication', requirement: 'optional' },
      { templateKey: 'financial', requirement: 'recommended' },
    ],
  },
  {
    name: 'Implant Bundle',
    description: 'Implant placement packet, including sedation when applicable.',
    procedureCodes: ['D6010'],
    items: [
      { templateKey: 'implant', requirement: 'required' },
      { templateKey: 'bone-graft', requirement: 'conditional', conditionLabel: 'Bone graft planned with placement?' },
      { templateKey: 'sedation', requirement: 'conditional', conditionLabel: 'Sedation being used?' },
      { templateKey: 'postop', requirement: 'recommended' },
      { templateKey: 'financial', requirement: 'recommended' },
    ],
  },
  {
    name: 'Root Canal Bundle',
    description: 'Endodontic consent with the crown recommendation acknowledged.',
    procedureCodes: ['D3310', 'D3320', 'D3330'],
    items: [
      { templateKey: 'root-canal', requirement: 'required' },
      { templateKey: 'crown', requirement: 'recommended' },
      { templateKey: 'medication', requirement: 'optional' },
      { templateKey: 'financial', requirement: 'recommended' },
    ],
  },
  {
    name: 'Periodontal Bundle',
    description: 'SRP and instrumentation consents the hygiene team can run.',
    procedureCodes: ['D4341', 'D4342', 'D4346'],
    items: [
      { templateKey: 'srp', requirement: 'required' },
      { templateKey: 'sonic', requirement: 'recommended' },
      { templateKey: 'financial', requirement: 'recommended' },
    ],
  },
  {
    name: 'Denture Bundle',
    description: 'Expectations, home care, and the financial agreement for dentures.',
    procedureCodes: ['D5110', 'D5120'],
    items: [
      { templateKey: 'denture', requirement: 'required' },
      { templateKey: 'postop', requirement: 'optional' },
      { templateKey: 'financial', requirement: 'recommended' },
    ],
  },
];
