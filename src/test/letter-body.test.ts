import { describe, it, expect } from 'vitest';
import {
  formatLetterDate,
  parseLetterBody,
  parseRuns,
  placeholdersIn,
  resolvePlaceholders,
  todayISO,
  withDerivedValues,
} from '@/lib/letters/letter-body';
import { insertText, toggleAlign, toggleList, wrapSelection } from '@/lib/letters/editor-ops';
import {
  buildNoteBody,
  DEFAULT_SCHOOL_NOTE_WORDING,
  DEFAULT_WORK_NOTE_WORDING,
  noteWordingFor,
} from '@/lib/letters/note-wording';
import { authorizedSignatureUser } from '@/lib/letters/signing';
import type { NoteFields } from '@/lib/letters/types';

describe('letter markup parser', () => {
  it('splits blank-line paragraphs and joins single newlines', () => {
    const blocks = parseLetterBody('First line\ncontinues here.\n\nSecond paragraph.');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: 'p', align: 'left' });
    expect((blocks[0] as { runs: { text: string }[] }).runs[0].text).toBe(
      'First line continues here.',
    );
  });

  it('parses **bold** and _italic_ runs, including nested', () => {
    expect(parseRuns('a **bold** and _lean_ word')).toEqual([
      { text: 'a ', bold: false, italic: false },
      { text: 'bold', bold: true, italic: false },
      { text: ' and ', bold: false, italic: false },
      { text: 'lean', bold: false, italic: true },
      { text: ' word', bold: false, italic: false },
    ]);
    expect(parseRuns('**_both_**')).toEqual([{ text: 'both', bold: true, italic: true }]);
  });

  it('parses bullet and numbered lists', () => {
    const blocks = parseLetterBody('- one\n- two\n\n1. first\n2. second');
    expect(blocks[0].kind).toBe('ul');
    expect(blocks[1].kind).toBe('ol');
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it('honors ::center and ::right alignment directives', () => {
    const blocks = parseLetterBody('::center Centered notice\n\n::right Right side');
    expect(blocks[0]).toMatchObject({ kind: 'p', align: 'center' });
    expect(blocks[1]).toMatchObject({ kind: 'p', align: 'right' });
  });

  it('never emits raw markup — unmatched markers pass through as text', () => {
    const blocks = parseLetterBody('a ** dangling marker <script>');
    expect((blocks[0] as { runs: { text: string }[] }).runs.map(r => r.text).join('')).toBe(
      'a ** dangling marker <script>',
    );
  });
});

describe('placeholders', () => {
  it('finds distinct placeholders in order', () => {
    expect(placeholdersIn('Dear {{patient_name}}, from {{office_name}} re {{patient_name}}')).toEqual(
      ['patient_name', 'office_name'],
    );
  });

  it('resolves values, leaves blanks as written-in lines by default', () => {
    expect(resolvePlaceholders('Dear {{patient_name}},', { patient_name: 'Ann' })).toBe('Dear Ann,');
    expect(resolvePlaceholders('Dear {{patient_name}},', {})).toBe('Dear ____________,');
    expect(resolvePlaceholders('Dear {{ patient_name }},', { patient_name: 'Ann' })).toBe('Dear Ann,');
  });

  it('keep mode preserves tokens for template previews', () => {
    expect(resolvePlaceholders('Hi {{first_name}}', {}, { missing: 'keep' })).toBe('Hi {{first_name}}');
  });

  it('derives first_name from patient_name when absent', () => {
    expect(withDerivedValues({ patient_name: 'Ann Example' }).first_name).toBe('Ann');
    expect(withDerivedValues({ patient_name: 'Ann Example', first_name: 'Annie' }).first_name).toBe('Annie');
  });
});

describe('letter dates', () => {
  it('formats ISO dates in professional long form', () => {
    expect(formatLetterDate('2026-08-07')).toBe('August 7, 2026');
    expect(formatLetterDate('2026-01-01')).toBe('January 1, 2026');
  });

  it('passes unparseable input through', () => {
    expect(formatLetterDate('8/7/2026')).toBe('8/7/2026');
    expect(formatLetterDate('')).toBe('');
  });

  it('todayISO renders local YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 7, 7))).toBe('2026-08-07');
  });
});

describe('editor operations', () => {
  it('wraps and unwraps bold/italic selections', () => {
    const wrapped = wrapSelection({ value: 'make this bold', start: 5, end: 9 }, '**');
    expect(wrapped.value).toBe('make **this** bold');
    const unwrapped = wrapSelection({ value: 'make **this** bold', start: 5, end: 13 }, '**');
    expect(unwrapped.value).toBe('make this bold');
  });

  it('toggles bullet and numbered lists across selected lines', () => {
    const on = toggleList({ value: 'one\ntwo', start: 0, end: 7 }, 'ul');
    expect(on.value).toBe('- one\n- two');
    const off = toggleList({ value: on.value, start: 0, end: on.value.length }, 'ul');
    expect(off.value).toBe('one\ntwo');
    const numbered = toggleList({ value: 'one\ntwo', start: 0, end: 7 }, 'ol');
    expect(numbered.value).toBe('1. one\n2. two');
  });

  it('toggles paragraph alignment directives', () => {
    const on = toggleAlign({ value: 'Notice text', start: 0, end: 0 }, 'center');
    expect(on.value).toBe('::center Notice text');
    const off = toggleAlign({ value: on.value, start: 0, end: 0 }, 'center');
    expect(off.value).toBe('Notice text');
  });

  it('inserts placeholder tokens at the cursor', () => {
    const next = insertText({ value: 'Dear ,', start: 5, end: 5 }, '{{patient_name}}');
    expect(next.value).toBe('Dear {{patient_name}},');
  });
});

describe('school/work note wording', () => {
  const base: NoteFields = {
    noteFor: 'school',
    patientName: 'Ann Example',
    dateSeenISO: '2026-08-07',
    excusedFromISO: '',
    excusedThroughISO: '',
    returnDateISO: '',
    restrictions: '',
  };
  const settings = { schoolNoteWording: '', workNoteWording: '' };

  it('ships usable defaults for both paths', () => {
    expect(noteWordingFor('school', settings)).toBe(DEFAULT_SCHOOL_NOTE_WORDING);
    expect(noteWordingFor('work', settings)).toBe(DEFAULT_WORK_NOTE_WORDING);
    expect(DEFAULT_SCHOOL_NOTE_WORDING).toContain('school');
    expect(DEFAULT_WORK_NOTE_WORDING).toContain('work');
  });

  it('minimal note: name + date seen only — optional-date sentences drop whole', () => {
    const body = buildNoteBody(base, settings);
    expect(body).toBe('Ann Example was seen in our office on August 7, 2026.');
    expect(body).not.toContain('{{');
    expect(body).not.toContain('____');
  });

  it('return date adds its sentence', () => {
    const body = buildNoteBody({ ...base, returnDateISO: '2026-08-10' }, settings);
    expect(body).toContain('Ann Example may return to school on August 10, 2026.');
  });

  it('an excused range prints from/through; a single day collapses to "on"', () => {
    const range = buildNoteBody(
      { ...base, excusedFromISO: '2026-08-07', excusedThroughISO: '2026-08-09' },
      settings,
    );
    expect(range).toContain('from August 7, 2026 through August 9, 2026');

    const single = buildNoteBody({ ...base, excusedFromISO: '2026-08-07' }, settings);
    expect(single).toContain('absence from school on August 7, 2026');
    expect(single).not.toContain('through');
  });

  it('work notes use the work wording', () => {
    const body = buildNoteBody(
      { ...base, noteFor: 'work', excusedFromISO: '2026-08-07', excusedThroughISO: '2026-08-08' },
      settings,
    );
    expect(body).toContain('absence from work');
  });

  it('restrictions append as their own bolded paragraph', () => {
    const body = buildNoteBody({ ...base, restrictions: 'No gym for 48 hours.' }, settings);
    expect(body).toContain('**Restrictions / additional notes:** No gym for 48 hours.');
  });

  it('office-configured wording overrides the default', () => {
    const body = buildNoteBody(base, {
      schoolNoteWording: '{{patient_name}} attended a dental visit on {{date_seen}}.',
      workNoteWording: '',
    });
    expect(body).toBe('Ann Example attended a dental visit on August 7, 2026.');
  });

  it('a blank patient name prints as a written-in blank, never a token', () => {
    const body = buildNoteBody({ ...base, patientName: '' }, settings);
    expect(body).toContain('____');
    expect(body).not.toContain('{{');
  });
});

describe('signature-use authorization (client mirror of storage RLS)', () => {
  it('your own signature is always usable', () => {
    expect(authorizedSignatureUser({ userId: 'me', allowOfficeUse: false }, 'me')).toBe('me');
  });

  it("a teammate's signature requires their allow_office_use consent", () => {
    expect(authorizedSignatureUser({ userId: 'them', allowOfficeUse: false }, 'me')).toBeNull();
    expect(authorizedSignatureUser({ userId: 'them', allowOfficeUse: true }, 'me')).toBe('them');
  });

  it('no stored signature = no ink', () => {
    expect(authorizedSignatureUser(undefined, 'me')).toBeNull();
  });
});
