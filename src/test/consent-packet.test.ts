/**
 * The temporary packet: fee math and the privacy boundary. Patient values
 * exist only in memory during the Complete Forms workflow — this suite
 * pins both the arithmetic the financial form prints and the structural
 * guarantee that the workflow never persists what it collects.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  emptyPacketFill, fillHasPatientInfo, packetTotals, type PacketFill,
} from '@/lib/consents/types';

const fillWith = (patch: Partial<PacketFill>): PacketFill => ({
  ...emptyPacketFill('2026-08-03'),
  ...patch,
});

describe('packetTotals', () => {
  it('sums procedure fees and applies adjustments in order', () => {
    const fill = fillWith({
      procedures: [
        { code: 'D7140', description: 'Extraction', officeFeeCents: 25000, feeCents: 25000, overridden: false },
        { code: 'D7953', description: 'Bone graft', officeFeeCents: 60000, feeCents: 50000, overridden: true },
      ],
      discountCents: 5000,
      insuranceEstimateCents: 30000,
      depositCents: 10000,
    });
    const totals = packetTotals(fill);
    expect(totals.subtotalCents).toBe(75000);
    expect(totals.totalCents).toBe(70000);
    expect(totals.estimatedPatientCents).toBe(30000);
  });

  it('never goes negative and skips fee-less procedures', () => {
    const fill = fillWith({
      procedures: [{ code: 'D0140', description: 'Exam', officeFeeCents: null, feeCents: null, overridden: false }],
      discountCents: 1000,
      insuranceEstimateCents: 99999,
    });
    const totals = packetTotals(fill);
    expect(totals.subtotalCents).toBe(0);
    expect(totals.totalCents).toBe(0);
    expect(totals.estimatedPatientCents).toBe(0);
  });
});

describe('fillHasPatientInfo', () => {
  it('is false for a fresh fill (the auto-filled date is not patient info)', () => {
    expect(fillHasPatientInfo(emptyPacketFill('2026-08-03'))).toBe(false);
  });

  it('is true the moment anything identifying is typed', () => {
    expect(fillHasPatientInfo(fillWith({ patientName: 'x' }))).toBe(true);
    expect(fillHasPatientInfo(fillWith({ toothNumbers: '14' }))).toBe(true);
    expect(fillHasPatientInfo(fillWith({ notes: 'nervous patient' }))).toBe(true);
    expect(fillHasPatientInfo(fillWith({ answers: { 'f:b': 'yes' } }))).toBe(true);
  });
});

describe('privacy boundary — the workflow cannot store what it collects', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'pages', 'CompleteForms.tsx'), 'utf8');

  it('never writes to browser storage', () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
  });

  it('never inserts or upserts rows from the workflow', () => {
    // The page's only database writes are the bundle-use counter RPC and the
    // de-identified fee-override audit entry — both imported helpers. The
    // page itself must not gain a direct table write.
    expect(source).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
  });

  it('the fee-override audit entry carries the code and amounts, never the patient', () => {
    const auditCall = source.match(/action: 'fee_overridden'[\s\S]*?detail: \{([^}]*)\}/);
    expect(auditCall, 'fee override audit call exists').toBeTruthy();
    const detail = auditCall![1];
    expect(detail).toContain('code');
    expect(detail).not.toMatch(/patientName|toothNumbers|notes|answers|surfaces/);
  });

  it('funnels every exit through the clear path', () => {
    expect(source).toContain('clearAll');
    expect(source).toContain('beforeunload');
    expect(source).toContain('clearTimeoutMinutes');
  });

  it('blocks in-app navigation with a stay-or-discard choice (never silent loss)', () => {
    expect(source).toMatch(/useBlocker\(hasPatientInfo\)/);
    expect(source).toContain('Discard and leave');
    // Leaving must clear before proceeding, and there is no save-for-later.
    expect(source).toMatch(/clearAll\(\); blocker\.proceed/);
    expect(source).not.toMatch(/saveForLater|savePacket|packetDraft/);
  });

  it('clears the packet when the office context changes', () => {
    expect(source).toMatch(/ctx\.org_id !== orgIdRef\.current/);
  });

  it('never routes patient values into URLs or history state', () => {
    expect(source).not.toMatch(/searchParams|useSearchParams|history\.pushState|location\.hash/i);
  });
});
