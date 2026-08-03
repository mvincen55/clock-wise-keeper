/**
 * The sample library ships ready to test with — so it must actually be
 * usable: signatures present, consent statements where consents need them,
 * bundles wired to real templates, nothing overflowing a letter page.
 */
import { describe, it, expect } from 'vitest';
import { SAMPLE_BUNDLES, SAMPLE_TEMPLATES } from '@/lib/consents/demo-content';
import { pagesLikelyToOverflow } from '@/lib/consents/validation';
import { deriveSignatureFacts } from '@/lib/consents/types';

const CONSENT_CATEGORIES = new Set([
  'general_consent', 'surgical_consent', 'restorative', 'endodontic',
  'periodontal', 'implant', 'orthodontic', 'sedation',
]);

describe('sample templates', () => {
  it('covers the required starter set', () => {
    const names = SAMPLE_TEMPLATES.map(t => t.name.toLowerCase()).join('|');
    for (const needle of [
      'general treatment consent', 'extraction', 'bone graft', 'scaling and root planing',
      'sonic', 'root canal', 'crown', 'implant', 'denture', 'financial agreement',
      'postoperative', 'medication',
    ]) {
      expect(names, `missing sample: ${needle}`).toContain(needle);
    }
  });

  it('every template has unique keys and names', () => {
    const keys = SAMPLE_TEMPLATES.map(t => t.key);
    const names = SAMPLE_TEMPLATES.map(t => t.name);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every template builds valid, signed, printable content', () => {
    for (const sample of SAMPLE_TEMPLATES) {
      const content = sample.build();
      expect(content.blocks.length, sample.key).toBeGreaterThan(3);
      // Unique block ids within a template (fills key answers by id).
      const ids = content.blocks.map(b => b.id);
      expect(new Set(ids).size, sample.key).toBe(ids.length);
      // A title leads every form.
      expect(content.blocks[0].type, sample.key).toBe('title');
      // Everything fits a letter page or declares its own page breaks.
      expect(pagesLikelyToOverflow(content.blocks), sample.key).toEqual([]);
    }
  });

  it('clinical consents carry a consent statement and a patient signature', () => {
    for (const sample of SAMPLE_TEMPLATES.filter(s => CONSENT_CATEGORIES.has(s.category))) {
      const content = sample.build();
      const facts = deriveSignatureFacts(content);
      expect(facts.patient, `${sample.key} needs a patient signature`).toBe(true);
      expect(
        content.blocks.some(b => b.type === 'section' && b.kind === 'consent_statement'),
        `${sample.key} needs a consent statement`,
      ).toBe(true);
    }
  });

  it('only the financial agreement includes cost — consents never do by default', () => {
    for (const sample of SAMPLE_TEMPLATES) {
      const facts = deriveSignatureFacts(sample.build());
      if (sample.key === 'financial') {
        expect(facts.includesCost).toBe(true);
        expect(sample.isFinancial).toBe(true);
      } else {
        expect(facts.includesCost, `${sample.key} must not auto-include cost`).toBe(false);
      }
    }
  });

  it('hygienist-completable forms are the periodontal ones', () => {
    const hygienist = SAMPLE_TEMPLATES.filter(t => t.hygienistMayComplete).map(t => t.key).sort();
    expect(hygienist).toEqual(['sonic', 'srp']);
  });
});

describe('sample bundles', () => {
  const keys = new Set(SAMPLE_TEMPLATES.map(t => t.key));

  it('ships the five treatment bundles', () => {
    expect(SAMPLE_BUNDLES.map(b => b.name)).toEqual([
      'Extraction Bundle', 'Implant Bundle', 'Root Canal Bundle',
      'Periodontal Bundle', 'Denture Bundle',
    ]);
  });

  it('every bundle item references a real template', () => {
    for (const bundle of SAMPLE_BUNDLES) {
      for (const item of bundle.items) {
        expect(keys.has(item.templateKey), `${bundle.name} → ${item.templateKey}`).toBe(true);
      }
    }
  });

  it('every bundle has exactly one required core form and conditional items ask a question', () => {
    for (const bundle of SAMPLE_BUNDLES) {
      expect(bundle.items.filter(i => i.requirement === 'required').length, bundle.name).toBe(1);
      for (const item of bundle.items.filter(i => i.requirement === 'conditional')) {
        expect(item.conditionLabel, `${bundle.name} → ${item.templateKey}`).toBeTruthy();
      }
    }
  });
});
