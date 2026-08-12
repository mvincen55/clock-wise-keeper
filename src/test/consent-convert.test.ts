/**
 * The upload converter: the local heuristic engine (also the fallback when
 * consent-ai is unreachable) and the sanitizer every AI conversion passes
 * through before the review screen. Content may be reshaped, never lost.
 */
import { describe, it, expect } from 'vitest';
import {
  cleanupConvertedContent, guessCategory, guessSectionKind, heuristicConvert,
  inferProcedureCodes, sanitizeBlocks, sanitizeCategory, suggestedFormName,
} from '@/lib/consents/convert';
import { makeBlock } from '@/lib/consents/types';

const SCANNED_FORM = `
EXTRACTION CONSENT

Patient Name: ____________________  Date: ________
DOB: ______________

I understand that my tooth cannot be saved and must be removed.

RISKS AND COMPLICATIONS
- Bleeding, swelling and bruising
- Dry socket
- Infection requiring antibiotics

Do you take blood thinners?   Yes / No
[ ] I received postoperative instructions

________ I understand a removed tooth cannot be reattached. (initials)

Patient Signature: _______________________   Date: __________
Doctor Signature: ________________________
`;

describe('heuristicConvert', () => {
  const content = heuristicConvert('Extraction Consent', SCANNED_FORM);
  const types = content.blocks.map(b => b.type);

  it('leads with a title', () => {
    expect(content.blocks[0]).toMatchObject({ type: 'title', label: 'Extraction Consent' });
  });

  it('finds the fill-in fields', () => {
    expect(types).toContain('patient_name');
    expect(types).toContain('date');
    expect(types).toContain('yesno');
    expect(types).toContain('checkbox');
    expect(types).toContain('initials');
  });

  it('reads headings as sections and classifies risks', () => {
    const section = content.blocks.find(b => b.type === 'section' && /risks/i.test(b.label ?? ''));
    expect(section).toBeTruthy();
    expect(section!.kind).toBe('risks');
  });

  it('keeps bullet lists as bullets', () => {
    const bullets = content.blocks.find(b => b.type === 'bullets');
    expect(bullets?.items).toContain('Dry socket');
  });

  it('captures both signatures with the right roles', () => {
    const roles = content.blocks.filter(b => b.type === 'signature').map(b => b.role);
    expect(roles).toContain('patient');
    expect(roles).toContain('doctor');
  });

  it('maps a DOB line to a Date of Birth field', () => {
    expect(content.blocks.some(b => b.type === 'date' && b.label === 'Date of Birth')).toBe(true);
  });

  it('never adds a date field beside a signature — the printed line has its own date column', () => {
    content.blocks.forEach((b, i) => {
      if (b.type === 'signature') expect(content.blocks[i + 1]?.type).not.toBe('date');
    });
  });

  it('always ends usable: a form with no detected signature gets one', () => {
    const bare = heuristicConvert('Notes', 'Just a paragraph of text with nothing else.');
    expect(bare.blocks.some(b => b.type === 'signature')).toBe(true);
  });
});

describe('suggestedFormName', () => {
  it('strips the extension and separator runs', () => {
    expect(suggestedFormName('Extraction_Consent.pdf')).toBe('Extraction Consent');
  });

  it('drops the junk print drivers and cloud drives bolt onto names', () => {
    expect(suggestedFormName('Informed Refusal of X rays - Google Docs.pdf'))
      .toBe('Informed Refusal of X rays');
    expect(suggestedFormName('Microsoft Word - Crown Consent.pdf')).toBe('Crown Consent');
    expect(suggestedFormName('Copy of Sedation Consent (2).docx')).toBe('Sedation Consent');
    expect(suggestedFormName('Denture Care - Copy.pdf')).toBe('Denture Care');
  });

  it('keeps hyphenated words but splits fully dash-glued names', () => {
    expect(suggestedFormName('Pre-Op Instructions.pdf')).toBe('Pre-Op Instructions');
    expect(suggestedFormName('informed-refusal-of-x-rays.pdf')).toBe('informed refusal of x rays');
  });

  it('never returns empty, even for junk-only names', () => {
    expect(suggestedFormName('Copy of (1).pdf')).not.toBe('');
  });
});

describe('cleanupConvertedContent', () => {
  it('drops fields the printed master layout already provides', () => {
    const cleaned = cleanupConvertedContent({
      blocks: [
        makeBlock('title', { label: 'Radiograph Refusal' }),
        makeBlock('patient_name', { label: 'Patient Name' }),
        makeBlock('date', { label: 'DOB' }),
        makeBlock('paragraph', { body: 'I decline the recommended radiographs.' }),
        makeBlock('signature', { role: 'patient' }),
        makeBlock('date', { label: 'Date' }),
      ],
    });
    expect(cleaned.blocks.map(b => b.type)).toEqual(['title', 'paragraph', 'signature']);
  });

  it('keeps meaningful date fields', () => {
    const cleaned = cleanupConvertedContent({
      blocks: [
        makeBlock('date', { label: 'Date of last cleaning' }),
        makeBlock('signature', { role: 'patient' }),
        makeBlock('date', { label: 'Date of next visit' }),
      ],
    });
    expect(cleaned.blocks).toHaveLength(3);
  });

  it('scrubs the heuristic output the same way the AI path is scrubbed', () => {
    const cleaned = cleanupConvertedContent(heuristicConvert('Extraction Consent', SCANNED_FORM));
    const types = cleaned.blocks.map(b => b.type);
    expect(types).not.toContain('patient_name');
    expect(cleaned.blocks.some(b => b.type === 'date' && b.label === 'Date of Birth')).toBe(false);
  });
});

describe('sanitizeBlocks', () => {
  it('accepts well-formed AI output and reassigns ids', () => {
    const out = sanitizeBlocks({
      blocks: [
        { type: 'title', label: 'Crown Consent' },
        { type: 'section', label: 'Risks', kind: 'risks' },
        { type: 'signature', role: 'witness' },
      ],
    });
    expect(out.blocks).toHaveLength(3);
    expect(out.blocks[2]).toMatchObject({ type: 'signature', role: 'witness' });
    expect(new Set(out.blocks.map(b => b.id)).size).toBe(3);
  });

  it('salvages unknown block types as paragraphs instead of dropping content', () => {
    const out = sanitizeBlocks([{ type: 'weird_widget', body: 'Important clinical wording' }]);
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0]).toMatchObject({ type: 'paragraph', body: 'Important clinical wording' });
  });

  it('defends against garbage roles, kinds, and non-arrays', () => {
    const out = sanitizeBlocks([
      { type: 'signature', role: 'attorney' },
      { type: 'section', label: 'Alternatives', kind: 'nonsense' },
      null,
      42,
      { type: 'bullets', items: [] },
    ]);
    expect(out.blocks).toHaveLength(2);
    expect(out.blocks[0].role).toBe('patient');
    expect(out.blocks[1].kind).toBe('alternatives');
    expect(sanitizeBlocks('not even close').blocks).toEqual([]);
  });
});

describe('classification', () => {
  it('guesses categories from wording', () => {
    expect(guessCategory('SRP consent', 'scaling and root planing')).toBe('periodontal');
    expect(guessCategory('', 'payment is due at time of service fee agreement')).toBe('financial');
    expect(guessCategory('Implant consent', '')).toBe('implant');
    expect(guessCategory('Mystery', 'unrelated text')).toBe('other');
  });

  it('guesses section kinds from headings', () => {
    expect(guessSectionKind('Serious but less common risks')).toBe('serious_risks');
    expect(guessSectionKind('Risks and complications')).toBe('risks');
    expect(guessSectionKind('Alternatives to treatment')).toBe('alternatives');
    expect(guessSectionKind('Consent statement')).toBe('consent_statement');
  });

  it('sanitizes categories to the known set', () => {
    expect(sanitizeCategory('implant')).toBe('implant');
    expect(sanitizeCategory('made-up')).toBe('other');
    expect(sanitizeCategory(null)).toBe('other');
  });
});

describe('inferProcedureCodes', () => {
  const meta = [
    { code: 'D7140', patientName: 'Simple extraction', internalDescription: 'Extraction, erupted tooth', keywords: ['extraction', 'pull'] },
    { code: 'D7953', patientName: 'Bone graft', internalDescription: '', keywords: ['graft', 'socket preservation'] },
    { code: 'D2740', patientName: 'Porcelain crown', internalDescription: '', keywords: ['crown'] },
    { code: 'D0140', patientName: 'Exam', internalDescription: '', keywords: ['gum'] }, // short keyword: never matches
  ];

  it('explicit CDT codes in the document are confident', () => {
    const r = inferProcedureCodes('Consent', 'This covers D7140 and D7953.', meta);
    expect(r.confident).toEqual(['D7140', 'D7953']);
    expect(r.suggested).toEqual([]);
  });

  it('a title match is confident; a body match is only a suggestion', () => {
    const r = inferProcedureCodes(
      'Extraction Consent',
      'A bone graft may be placed in the socket after removal.',
      meta,
    );
    expect(r.confident).toEqual(['D7140']);
    expect(r.suggested).toEqual(['D7953']);
  });

  it('short generic keywords never match, and unrelated codes stay out', () => {
    const r = inferProcedureCodes('Post-op instructions', 'Care for your gums after treatment.', meta);
    expect(r.confident).toEqual([]);
    expect(r.suggested).toEqual([]);
  });
});
