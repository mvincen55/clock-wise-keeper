import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { scanForPatientIdentifiers } from '@/lib/consents/pii';
import type { LetterTemplateContent } from '@/lib/letters/types';

/**
 * The correspondence privacy boundary, in the codebase's
 * source-scanning-guard idiom (see consent-packet.test.ts,
 * schedule-reader-boundary.test.ts):
 *
 *   - School/Work notes CANNOT be saved: the page has no save affordance,
 *     no browser persistence, and no database writes of any kind.
 *   - The letter composer prints without saving; its ONLY save path is the
 *     template dialog, whose payload type carries wording only.
 *   - Saved letters are gated by the local patient-identifier scanner and
 *     an explicit confirmation — and by RLS on the office's team setting.
 */

const src = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const PERSISTENCE = /localStorage|sessionStorage|indexedDB/i;
const DB_WRITES = /\.insert\(|\.upsert\(|\.update\(|\.delete\(|functions\.invoke/;

describe('School/Work note cannot be saved (static)', () => {
  const page = src('pages', 'SchoolWorkNote.tsx');

  it('has no browser persistence and no database writes', () => {
    expect(page).not.toMatch(PERSISTENCE);
    expect(page).not.toMatch(DB_WRITES);
    // Reads settings/branding/signatures through hooks only — the page
    // itself never touches a supabase client.
    expect(page).not.toMatch(/from '@\/integrations\/supabase/);
    expect(page).not.toMatch(/letterDb/);
  });

  it('offers print and clear, never save', () => {
    // No Save affordance: no rendered "Save" label, icon, or handler —
    // the word only appears in the "nothing is saved" trust copy.
    expect(page).not.toMatch(/>\s*Save\b/);
    expect(page).not.toMatch(/aria-label="Save/i);
    expect(page).not.toMatch(/useCreateLetterTemplate|useUpdateLetterTemplate|SaveTemplateDialog/);
    expect(page).toContain('window.print()');
    expect(page).toContain('Did the note print correctly?');
    expect(page).toContain('clear patient information');
  });

  it('keeps patient fields in component state that clears', () => {
    expect(page).toContain('useState<NoteFields>');
    expect(page).toContain('clearPatient');
    // No URL round-trips of patient values.
    expect(page).not.toMatch(/useSearchParams|URLSearchParams/);
  });
});

describe('Write on Letterhead prints without saving (static)', () => {
  const page = src('pages', 'WriteLetter.tsx');

  it('has no browser persistence and no direct database writes', () => {
    expect(page).not.toMatch(PERSISTENCE);
    expect(page).not.toMatch(DB_WRITES);
    expect(page).not.toMatch(/from '@\/integrations\/supabase/);
  });

  it('printing does not pass through any mutation', () => {
    const doPrint = page.match(/const doPrint = \(\) => \{([\s\S]*?)\};/);
    expect(doPrint).toBeTruthy();
    expect(doPrint![1]).toContain('window.print()');
    expect(doPrint![1]).not.toMatch(/mutate|save|insert|upsert/i);
  });

  it('the only save path is the template dialog, fed wording only', () => {
    const dialogInput = page.match(/input=\{\{([\s\S]*?)\}\}/);
    expect(dialogInput).toBeTruthy();
    // Wording fields only — never recipient or fill values.
    expect(dialogInput![1]).not.toMatch(/recipient|fill|patient|values/);
  });
});

describe('template payload carries wording only (type + runtime)', () => {
  it('LetterTemplateContent has no recipient/patient fields', () => {
    const content: LetterTemplateContent = {
      title: 't', category: 'general', subject: 's', body: 'b', closing: 'c',
    };
    expect(Object.keys(content).sort()).toEqual(['body', 'category', 'closing', 'subject', 'title']);
    // The type itself rejects recipient fields (compile-time guarantee):
    // @ts-expect-error — recipient data cannot ride along on a template save
    const bad: LetterTemplateContent = { ...content, recipientName: 'Ann' };
    void bad;
  });

  it('the create/update hooks persist only the content columns', () => {
    const hooks = src('hooks', 'useLetterTemplates.ts');
    // No recipient/patient-shaped keys in any persisted payload (prose in
    // doc comments may mention them; object keys may not).
    expect(hooks).not.toMatch(/\b(recipient|patient|address|city|state|zip|dob|chart)[a-z_]*\s*:/i);
  });
});

describe('patient-identifier gate for saved letters', () => {
  const allow = ['Northfield Dental Group, LLC', '(555) 010-0142'];

  it('blocks the identifiers the spec calls out', () => {
    expect(scanForPatientIdentifiers('Dear Mrs. Johnson, thank you', allow).hits).not.toHaveLength(0);
    expect(scanForPatientIdentifiers('DOB 2/14/1981 on file', allow).hits).not.toHaveLength(0);
    expect(scanForPatientIdentifiers('Chart #123456 shows', allow).hits).not.toHaveLength(0);
    expect(scanForPatientIdentifiers('SSN 123-45-6789', allow).hits).not.toHaveLength(0);
    expect(scanForPatientIdentifiers('Patient name: John Smith', allow).hits).not.toHaveLength(0);
  });

  it('allows placeholders, blanks, and office identity', () => {
    const template = [
      'Dear {{patient_name}},',
      'Patient Name: ____',
      'Please call Northfield Dental Group, LLC at (555) 010-0142.',
      'Patient: {{patient_name}} may return on {{today}}.',
    ].join('\n');
    expect(scanForPatientIdentifiers(template, allow).hits).toEqual([]);
  });

  it('the save dialog wires the scan before any mutation and shows the block screen', () => {
    const dialog = src('components', 'letterhead', 'SaveTemplateDialog.tsx');
    expect(dialog).toContain('scanForPatientIdentifiers');
    // Scan verdict gates the mutation…
    expect(dialog).toMatch(/const found = runScan\(\);\s*if \(found\.length > 0\) \{\s*setHits\(found\);\s*return;/);
    // …the warning is always shown (the dialog IS the warning)…
    expect(dialog).toContain('Save the office');
    expect(dialog).toContain('placeholders');
    // …and a human confirmation is still required on a clean scan.
    expect(dialog).toContain("it's reusable office content and contains no patient");
    expect(dialog).toMatch(/disabled=\{title\.trim\(\) === '' \|\| !confirmed/);
    // No AI involved — the scan is local.
    expect(dialog).not.toMatch(/functions\.invoke|fetch\(/);
  });
});

describe('RLS enforces the team-permission setting and org boundary (migration)', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20260807120000_letterhead_correspondence.sql'),
    'utf8',
  );

  it('template writes are gated by correspondence_team_can, reads by membership', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.correspondence_team_can');
    expect(migration).toMatch(/letter_templates FOR INSERT[\s\S]*?correspondence_team_can\(org_id\)/);
    expect(migration).toMatch(/letter_templates FOR UPDATE[\s\S]*?correspondence_team_can\(org_id\)/);
    expect(migration).toMatch(/letter_templates FOR SELECT[\s\S]*?is_org_member\(org_id\)/);
    expect(migration).toMatch(/letter_templates FOR DELETE[\s\S]*?is_org_admin\(org_id\)/);
    expect(migration).toContain('ALTER TABLE public.letter_templates ENABLE ROW LEVEL SECURITY');
  });

  it('settings are member-read, admin-write', () => {
    expect(migration).toMatch(/correspondence_settings FOR SELECT[\s\S]*?is_org_member\(org_id\)/);
    expect(migration).toMatch(/correspondence_settings FOR ALL[\s\S]*?is_org_admin\(org_id\)/);
  });

  it('stores no patient columns anywhere', () => {
    // Column definitions are two-space-indented identifiers; the HIPAA
    // commentary may say "patient", the schema may not define one.
    expect(migration).not.toMatch(/^\s{2}(patient|recipient|dob|date_of_birth|chart)[a-z_]*\s/im);
  });
});
