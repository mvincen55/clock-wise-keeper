import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PMS_SYSTEMS, normalizePmsSystem, pmsCaptureProfile } from '@/lib/pms';

/**
 * The capture assistant's privacy boundary, in the codebase's
 * source-scanning-guard idiom (letters-privacy.test.ts,
 * schedule-reader-boundary.test.ts): a Dentrix screenshot — live frame,
 * frozen frame, crop, OCR text, parsed values — must have NO network path
 * and NO persistence path, and every canvas must be wiped on every exit.
 */

const src = (...parts: string[]) =>
  readFileSync(join(process.cwd(), 'src', ...parts), 'utf8');

const PERSISTENCE = /localStorage|sessionStorage|indexedDB/i;
const NETWORK = /supabase|letterDb|functions\.invoke|fetch\(|axios|XMLHttpRequest|navigator\.sendBeacon|WebSocket/;
const URL_STATE = /useSearchParams|URLSearchParams|history\.pushState|location\.hash/;

describe('PmsCaptureDialog has no network or persistence path (static)', () => {
  const dialog = src('components', 'broken-appts', 'PmsCaptureDialog.tsx');

  it('never touches the network, storage, or URLs', () => {
    expect(dialog).not.toMatch(NETWORK);
    expect(dialog).not.toMatch(PERSISTENCE);
    expect(dialog).not.toMatch(URL_STATE);
    expect(dialog).not.toMatch(/console\.(log|info|warn|error)/);
  });

  it('uses only the local same-origin OCR infrastructure', () => {
    expect(dialog).toContain("from '@/lib/schedule-reader/ocr'");
    expect(dialog).not.toMatch(/https?:\/\//);
  });

  it('wipes canvases and stops tracks on every exit path', () => {
    // The one destroy-everything helper exists and runs on unmount,
    // close, apply, and retake.
    expect(dialog).toMatch(/const destroyAll = useCallback/);
    expect(dialog).toContain('useEffect(() => destroyAll, [destroyAll])');
    expect(dialog).toMatch(/wipeCanvas/);
    expect(dialog).toMatch(/track\.stop\(\)/);
    expect(dialog).toMatch(/wipeOcrWords\(words\)/);
    // Successful extraction destroys the images immediately.
    expect(dialog).toMatch(/setPhase\('review'\)/);
    expect(dialog.indexOf('wipeCanvas(crop)')).toBeGreaterThan(-1);
  });

  it('holds frames in refs, never in React state or URLs', () => {
    expect(dialog).not.toMatch(/useState<HTMLCanvasElement/);
    expect(dialog).not.toMatch(/toDataURL|toBlob/);
    expect(dialog).toContain('frameRef');
  });

  it('shows the privacy reassurance', () => {
    expect(dialog).toContain('Read on this device only. Screenshot is discarded after use.');
  });

  it('uses no countdown or timer to race the employee', () => {
    expect(dialog).not.toMatch(/setInterval|countdown/i);
    // Freeze rides on returning focus/visibility, with a manual fallback.
    expect(dialog).toContain("visibilitychange");
    expect(dialog).toContain('Freeze current');
  });
});

describe('parsers and checklist stay pure (static)', () => {
  it('dentrix-parse has no I/O of any kind', () => {
    const parse = src('lib', 'broken-appts', 'dentrix-parse.ts');
    expect(parse).not.toMatch(NETWORK);
    expect(parse).not.toMatch(PERSISTENCE);
    expect(parse).not.toMatch(/import .* from '(?!\.)/); // no runtime imports at all
  });

  it('checklist state helpers have no I/O of any kind', () => {
    const checklist = src('lib', 'broken-appts', 'checklist.ts');
    expect(checklist).not.toMatch(NETWORK);
    expect(checklist).not.toMatch(PERSISTENCE);
  });

  it('the workspace page still never writes patient data anywhere', () => {
    const page = src('pages', 'BrokenAppointments.tsx');
    expect(page).not.toMatch(PERSISTENCE);
    expect(page).not.toMatch(/\.insert\(|\.upsert\(|\.update\(|\.delete\(|functions\.invoke/);
    expect(page).not.toMatch(/from '@\/integrations\/supabase/);
    expect(page).not.toMatch(URL_STATE);
  });
});

describe('canonical PMS registry', () => {
  it('normalizes unknown values to not_configured', () => {
    expect(normalizePmsSystem('dentrix')).toBe('dentrix');
    expect(normalizePmsSystem('DENTRIX')).toBe('not_configured');
    expect(normalizePmsSystem(null)).toBe('not_configured');
    expect(normalizePmsSystem('random')).toBe('not_configured');
  });

  it('only Dentrix has a capture profile today; the rest stay generic', () => {
    expect(pmsCaptureProfile('dentrix')?.shortName).toBe('Dentrix');
    for (const pms of PMS_SYSTEMS.filter(p => p !== 'dentrix')) {
      expect(pmsCaptureProfile(pms)).toBeNull();
    }
  });

  it('the Dentrix profile teaches the blue-i / More Information path, briefly', () => {
    const profile = pmsCaptureProfile('dentrix')!;
    const all = profile.openSteps.join(' ');
    expect(all).toContain('More Information');
    expect(all).toContain('blue');
    expect(profile.openSteps.length).toBeLessThanOrEqual(4);
    expect(profile.targetHints.address).toContain('Address');
    expect(profile.targetHints.appointments).toContain('Appointments');
  });
});
