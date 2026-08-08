import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * The Account Balance Explainer's privacy boundary, in the codebase's
 * source-scanning-guard idiom (broken-appt-capture-privacy.test.ts): a
 * Dentrix ledger — live frame, frozen frame, crop, OCR text, parsed rows,
 * patient name, staff answers, generated explanation — must have NO network
 * path, NO persistence path, NO URL path, and NO logging path anywhere in
 * the feature. OCR is the local same-origin pipeline only.
 */

/**
 * Comments are stripped before scanning: the HIPAA-boundary headers in these
 * files deliberately NAME the forbidden sinks ("never to Supabase,
 * localStorage…"), and prose must not mask a real violation in code.
 */
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/[^\n]*$/gm, '');

const src = (...parts: string[]) =>
  stripComments(readFileSync(join(process.cwd(), 'src', ...parts), 'utf8'));

const PERSISTENCE = /localStorage|sessionStorage|indexedDB/i;
const NETWORK = /supabase|functions\.invoke|fetch\(|axios|XMLHttpRequest|navigator\.sendBeacon|WebSocket|gateway/i;
const URL_STATE = /useSearchParams|URLSearchParams|history\.pushState|location\.hash/;
const LOGGING = /console\.(log|info|warn|error|debug)/;

const LIB_DIR = join(process.cwd(), 'src', 'lib', 'account-balance');
const COMPONENT_DIR = join(process.cwd(), 'src', 'components', 'account-balance');

describe('account-balance library is pure and local', () => {
  for (const file of readdirSync(LIB_DIR)) {
    it(`${file} never touches the network, storage, URLs, or console`, () => {
      const code = stripComments(readFileSync(join(LIB_DIR, file), 'utf8'));
      expect(code).not.toMatch(NETWORK);
      expect(code).not.toMatch(PERSISTENCE);
      expect(code).not.toMatch(URL_STATE);
      expect(code).not.toMatch(LOGGING);
    });
  }
});

describe('LedgerCaptureDialog has no network or persistence path (static)', () => {
  const dialog = src('components', 'account-balance', 'LedgerCaptureDialog.tsx');

  it('never touches the network, storage, URLs, or console', () => {
    expect(dialog).not.toMatch(NETWORK);
    expect(dialog).not.toMatch(PERSISTENCE);
    expect(dialog).not.toMatch(URL_STATE);
    expect(dialog).not.toMatch(LOGGING);
  });

  it('uses only the local same-origin OCR infrastructure', () => {
    expect(dialog).toContain("from '@/lib/schedule-reader/ocr'");
    expect(dialog).not.toMatch(/https?:\/\//);
  });

  it('wipes canvases, OCR words, and tracks on every exit path', () => {
    expect(dialog).toMatch(/const destroyAll = useCallback/);
    expect(dialog).toContain('useEffect(() => destroyAll, [destroyAll])');
    expect(dialog).toMatch(/wipeCanvas/);
    expect(dialog).toMatch(/track\.stop\(\)/);
    expect(dialog).toMatch(/wipeOcrWords\(words\)/);
    expect(dialog).toMatch(/terminateOcr/);
    // Successful extraction destroys the frame and crop immediately.
    expect(dialog).toContain('wipeCanvas(crop)');
    expect(dialog).toContain('wipeCanvas(frameRef.current)');
  });

  it('holds frames in refs, never in React state or URLs', () => {
    expect(dialog).not.toMatch(/useState<HTMLCanvasElement/);
    expect(dialog).toMatch(/frameRef = useRef<HTMLCanvasElement/);
  });
});

describe('the workflow page keeps the session in memory only', () => {
  const page = src('pages', 'AccountBalanceExplainer.tsx');

  it('never persists, logs, or URL-encodes patient data', () => {
    expect(page).not.toMatch(PERSISTENCE);
    expect(page).not.toMatch(URL_STATE);
    expect(page).not.toMatch(LOGGING);
    // The ONLY network-adjacent import is de-identified org branding.
    expect(page).not.toMatch(/functions\.invoke|fetch\(|axios|sendBeacon|WebSocket/);
  });

  it('guards navigation and unload while patient data exists', () => {
    expect(page).toMatch(/useBlocker\(hasPatientData\)/);
    expect(page).toMatch(/beforeunload/);
  });

  it('offers the post-print clear action and confirms Start over', () => {
    expect(page).toContain('Clear patient data');
    expect(page).toMatch(/type: 'clearAll'/);
  });

  it('mounts the print portal only when READY FOR PATIENT', () => {
    expect(page).toMatch(/sheet && readiness\.ready &&\s*\n?\s*createPortal/);
  });
});

describe('print sheet and review components stay pure', () => {
  for (const file of readdirSync(COMPONENT_DIR)) {
    if (file === 'LedgerCaptureDialog.tsx') continue;
    it(`${file} has no network, persistence, URL, or console path`, () => {
      const code = stripComments(readFileSync(join(COMPONENT_DIR, file), 'utf8'));
      expect(code).not.toMatch(NETWORK);
      expect(code).not.toMatch(PERSISTENCE);
      expect(code).not.toMatch(URL_STATE);
      expect(code).not.toMatch(LOGGING);
    });
  }
});
