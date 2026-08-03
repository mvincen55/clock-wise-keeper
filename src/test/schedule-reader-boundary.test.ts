import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildKnownNames, checkPrivacy } from '@/lib/schedule-reader/privacy-detector';
import { classifyNote } from '@/lib/schedule-reader/note-classifier';
import { buildProviderMetrics } from '@/lib/schedule-reader/metrics-builder';
import { computeRollup, refereeMetrics } from '@/lib/schedule-reader/metrics-referee';
import { matchLayout } from '@/lib/schedule-reader/layout-detector';
import type { LayoutProfile, OcrWord } from '@/lib/schedule-reader/types';

// The Schedule Reader's whole promise: the screenshot and everything read off
// it stays on this device. Two layers of enforcement here, in the codebase's
// source-scanning-guard idiom (see phi-gateway-guard.test.ts):
//
//   1. STATIC — no file in src/lib/schedule-reader/ may contain network or
//      persistence primitives. There is no "safe" fetch in that directory.
//   2. RUNTIME — the analysis stages run with fetch/XHR/WebSocket/sendBeacon
//      instrumented; a single call fails the test.

const READER_DIR = path.resolve(__dirname, '../lib/schedule-reader');

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bfetch\s*\(/, why: 'network request' },
  { pattern: /XMLHttpRequest/, why: 'network request' },
  { pattern: /WebSocket/, why: 'network channel' },
  { pattern: /sendBeacon/, why: 'network beacon' },
  { pattern: /EventSource/, why: 'network channel' },
  { pattern: /https?:\/\//, why: 'external URL' },
  { pattern: /supabase/i, why: 'backend client' },
  { pattern: /functions\.invoke/, why: 'edge function call' },
  { pattern: /localStorage/, why: 'browser persistence' },
  { pattern: /sessionStorage/, why: 'browser persistence' },
  { pattern: /indexedDB/i, why: 'browser persistence' },
  { pattern: /caches\./, why: 'cache storage' },
  { pattern: /toDataURL/, why: 'image serialization (screenshot could escape as Base64)' },
  { pattern: /toBlob/, why: 'image serialization (screenshot could escape as a file)' },
  { pattern: /redact-image/, why: 'the screenshot-redaction helper is explicitly off-limits here' },
];

describe('schedule reader boundary (static)', () => {
  const files = readdirSync(READER_DIR).filter(f => f.endsWith('.ts'));

  it('covers the pipeline files', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'capture.ts',
        'worker.ts',
        'ocr.ts',
        'layout-detector.ts',
        'note-classifier.ts',
        'privacy-detector.ts',
        'metrics-builder.ts',
        'metrics-referee.ts',
        'destroy-capture.ts',
        'types.ts',
      ])
    );
  });

  for (const file of readdirSync(READER_DIR).filter(f => f.endsWith('.ts'))) {
    it(`${file} contains no network or persistence primitives`, () => {
      const source = readFileSync(path.join(READER_DIR, file), 'utf8');
      // Strip comments — the rules are about code, not documentation.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const { pattern, why } of FORBIDDEN_PATTERNS) {
        expect(
          pattern.test(code),
          `${file} matches ${pattern} (${why}) — nothing in the schedule reader may do this`
        ).toBe(false);
      }
    });
  }

  it('the reader only imports from within its own directory', () => {
    for (const file of files) {
      const source = readFileSync(path.join(READER_DIR, file), 'utf8');
      const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
      for (const imp of imports) {
        const ok = imp.startsWith('./') || imp === 'tesseract.js';
        expect(ok, `${file} imports "${imp}" — the reader depends only on itself and the local OCR engine`).toBe(
          true
        );
      }
    }
  });
});

describe('schedule reader boundary (runtime)', () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', (...args: unknown[]) => {
      calls.push(`fetch:${String(args[0])}`);
      return Promise.reject(new Error('network blocked by test'));
    });
    vi.stubGlobal(
      'XMLHttpRequest',
      class {
        open() {
          calls.push('xhr');
        }
        send() {
          calls.push('xhr-send');
        }
      }
    );
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor() {
          calls.push('websocket');
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('privacy check, layout match, classification, build, and referee make zero network calls', () => {
    let y = 0;
    const word = (text: string, x: number): OcrWord => ({
      text,
      bbox: { x0: x, y0: (y += 30), x1: x + 60, y1: y + 20 },
      confidence: 92,
    });
    const words: OcrWord[] = [
      word('8:00', 5),
      word('Hyg1', 200),
      word('LUNCH', 200),
      word('9:00', 5),
    ];

    const privacy = checkPrivacy(words, buildKnownNames(['Hyg1']));
    expect(privacy.passed).toBe(true);

    const profile: LayoutProfile = {
      id: null,
      name: 'test',
      pmsName: null,
      signature: {
        columns: [
          {
            xStart: 0.2,
            xEnd: 0.6,
            kind: 'provider',
            providerLabel: 'Hyg1',
            providerRole: 'hygienist',
            department: 'hygiene',
            employeeId: null,
          },
        ],
        timeGrid: {
          minutesPerRow: 10,
          yStart: 0.1,
          yEnd: 0.9,
          dayStartMinutes: 480,
          dayEndMinutes: 1020,
        },
        cancelledRemainVisible: true,
        blockStyle: 'mixed',
      },
      statusLegend: [
        { status: 'scheduled', r: 100, g: 100, b: 200, tolerance: 40 },
        { status: 'open', r: 255, g: 255, b: 255, tolerance: 20 },
      ],
    };

    matchLayout(words, 800, 600, profile);
    classifyNote('lunch');
    const provider = buildProviderMetrics({
      providerLabel: 'Hyg1',
      providerRole: 'hygienist',
      department: 'hygiene',
      employeeId: null,
      businessDate: '2026-07-30',
      rows: Array(10)
        .fill(null)
        .map(() => ({ category: 'scheduled' as const, scheduledColumns: 1 })),
      minutesPerRow: 10,
      activeColumns: 1,
      blocks: [],
      supportStaffAssigned: null,
      ocrConfidence: 0.9,
      layoutConfidence: 1,
    });
    refereeMetrics({ providers: [provider], blocks: [], rollup: computeRollup([provider]) });

    expect(calls).toEqual([]);
  });
});
