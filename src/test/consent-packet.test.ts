/**
 * The temporary packet: fee math and the privacy boundary. Patient values
 * exist only in memory during the Complete Forms workflow — this suite
 * pins both the arithmetic the financial form prints and the structural
 * guarantee that the workflow never persists what it collects.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeQuantity, countUnitTokens } from '@/lib/procedures';
import {
  emptyPacketFill, fillHasPatientInfo, packetLineTotal, packetTotals,
  type PacketFill, type PacketProcedure,
} from '@/lib/consents/types';

const fillWith = (patch: Partial<PacketFill>): PacketFill => ({
  ...emptyPacketFill('2026-08-03'),
  ...patch,
});

const proc = (patch: Partial<PacketProcedure>): PacketProcedure => ({
  code: 'D0000',
  description: 'Procedure',
  officeFeeCents: null,
  feeCents: null,
  overridden: false,
  quantity: 1,
  ...patch,
});

describe('packetTotals', () => {
  it('sums procedure fees and applies adjustments in order', () => {
    const fill = fillWith({
      procedures: [
        proc({ code: 'D7140', description: 'Extraction', officeFeeCents: 25000, feeCents: 25000 }),
        proc({ code: 'D7953', description: 'Bone graft', officeFeeCents: 60000, feeCents: 50000, overridden: true }),
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
      procedures: [proc({ code: 'D0140', description: 'Exam' })],
      discountCents: 1000,
      insuranceEstimateCents: 99999,
    });
    const totals = packetTotals(fill);
    expect(totals.subtotalCents).toBe(0);
    expect(totals.totalCents).toBe(0);
    expect(totals.estimatedPatientCents).toBe(0);
  });

  it('multiplies each line by its quantity (per-tooth code on 3 teeth)', () => {
    const fill = fillWith({
      procedures: [
        proc({ code: 'D7140', feeCents: 25000, quantity: 3, toothNumbers: '3, 14, 19' }),
        proc({ code: 'D0140', feeCents: 10000 }), // quantity 1 stays a plain fee
      ],
    });
    expect(packetTotals(fill).subtotalCents).toBe(85000);
  });

  it('multiplies the OVERRIDDEN unit fee by quantity', () => {
    const fill = fillWith({
      procedures: [proc({ officeFeeCents: 25000, feeCents: 20000, overridden: true, quantity: 2 })],
    });
    expect(packetTotals(fill).subtotalCents).toBe(40000);
  });

  it('treats a missing/garbage quantity as 1, never 0', () => {
    expect(packetLineTotal(proc({ feeCents: 5000, quantity: 0 }))).toBe(5000);
    expect(packetLineTotal(proc({ feeCents: 5000, quantity: Number.NaN }))).toBe(5000);
    expect(packetLineTotal(proc({ feeCents: null, quantity: 4 }))).toBeNull();
  });
});

describe('quantity strategies never blindly multiply by teeth', () => {
  it('a per-visit or flat code with 3 teeth listed stays quantity 1', () => {
    const teeth = countUnitTokens('3, 14, 19');
    expect(teeth).toBe(3);
    expect(computeQuantity('per_visit', { teeth })).toBe(1);
    expect(computeQuantity('flat', { teeth })).toBe(1);
  });

  it('a per-tooth code counts listed teeth; per-surface counts surface selections', () => {
    expect(computeQuantity('per_tooth', { teeth: countUnitTokens('3, 14, 19') })).toBe(3);
    // "MOD" is ONE compound surface selection — never 3 units.
    expect(computeQuantity('per_surface', { surfaces: countUnitTokens('MOD') })).toBe(1);
    // "MO, DO" is two selections.
    expect(computeQuantity('per_surface', { surfaces: countUnitTokens('MO, DO') })).toBe(2);
  });

  it('token counting handles commas, semicolons, and loose spacing', () => {
    expect(countUnitTokens('3,14 19; 30')).toBe(4);
    expect(countUnitTokens('  ')).toBe(0);
    expect(countUnitTokens(undefined)).toBe(0);
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

  it('per-procedure teeth/surfaces and signatures count as patient info', () => {
    expect(fillHasPatientInfo(fillWith({ procedures: [proc({ toothNumbers: '14' })] }))).toBe(true);
    expect(fillHasPatientInfo(fillWith({ procedures: [proc({ surfaces: 'MOD' })] }))).toBe(true);
    expect(fillHasPatientInfo(fillWith({ signatures: { patient: 'data:image/png;base64,AAA' } }))).toBe(true);
    // A procedure line alone (code + fee, no patient specifics) is not.
    expect(fillHasPatientInfo(fillWith({ procedures: [proc({ feeCents: 5000 })] }))).toBe(false);
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
    expect(detail).not.toMatch(/patientName|toothNumbers|notes|answers|surfaces|signatures/);
  });

  it('signatures never reach an audit detail, a supabase call, or storage', () => {
    // Every audit detail object in the workflow stays free of signature data.
    for (const match of source.matchAll(/detail: \{([^}]*)\}/g)) {
      expect(match[1]).not.toMatch(/signature|signedAt/i);
    }
    // The signature pad itself has no network or storage surface at all —
    // neither the consent wrapper nor the shared drawing primitive it
    // delegates to (which staff-profile signatures also use; persistence
    // decisions live with CALLERS, never inside the pad).
    const pad = readFileSync(
      join(process.cwd(), 'src', 'components', 'consents', 'SignatureCapture.tsx'), 'utf8');
    expect(pad).not.toMatch(/supabase|fetch\(|axios|localStorage|sessionStorage|indexedDB/i);
    const primitive = readFileSync(
      join(process.cwd(), 'src', 'components', 'signature', 'SignaturePadCanvas.tsx'), 'utf8');
    expect(primitive).not.toMatch(/supabase|fetch\(|axios|localStorage|sessionStorage|indexedDB/i);
    // Its only output is the onChange callback with a data URL.
    expect(primitive).toContain('onChange(canvas.toDataURL');
    expect(pad).toContain('onChange={onChange}');
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
