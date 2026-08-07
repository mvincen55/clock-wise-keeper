import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  fittedSize,
  inkBounds,
  isInkPixel,
  SIGNATURE_MAX_HEIGHT,
  SIGNATURE_MAX_WIDTH,
  validateSignatureUpload,
  whiteToTransparent,
  type PixelGrid,
} from '@/lib/letters/signature-image';
import { staffSignaturePath } from '@/lib/letters/db';

/**
 * Staff signature system — the stored-asset pipeline (pure pixel math) and
 * the security contract (RLS + storage policies asserted against the
 * migration, in the repo's rls-test idiom): self-service writes bound to
 * auth.uid(), org-boundary reads, teammate ink only behind the owner's
 * allow_office_use consent — and complete separation from the memory-only
 * patient consent signatures.
 */

function grid(width: number, height: number, painter?: (x: number, y: number) => number[] | null): PixelGrid {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = painter?.(x, y) ?? null;
      const i = (y * width + x) * 4;
      const [r, g, b, a] = px ?? [255, 255, 255, 255]; // default: opaque paper
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width, height, data };
}

const INK = [26, 26, 46, 255];

describe('signature image normalization (pure pixel math)', () => {
  it('classifies ink vs paper vs transparency', () => {
    const g = grid(3, 1, x => (x === 0 ? INK : x === 1 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
    expect(isInkPixel(g, 0, 0)).toBe(true);   // dark ink
    expect(isInkPixel(g, 1, 0)).toBe(false);  // paper white
    expect(isInkPixel(g, 2, 0)).toBe(false);  // transparent
  });

  it('finds the ink bounding box, ignoring paper margins', () => {
    const g = grid(20, 10, (x, y) => (x >= 5 && x <= 12 && y >= 3 && y <= 6 ? INK : null));
    expect(inkBounds(g)).toEqual({ left: 5, top: 3, right: 12, bottom: 6 });
  });

  it('returns null for a blank image (nothing to store)', () => {
    expect(inkBounds(grid(10, 10))).toBeNull();
  });

  it('flattens paper white to transparency but keeps ink opaque', () => {
    const g = grid(2, 1, x => (x === 0 ? INK : null));
    whiteToTransparent(g);
    expect(g.data[3]).toBe(255); // ink alpha untouched
    expect(g.data[7]).toBe(0);   // paper became transparent
  });

  it('fits oversized crops into the stored bounds, preserving aspect', () => {
    const fitted = fittedSize(2400, 400);
    expect(fitted.width).toBe(SIGNATURE_MAX_WIDTH);
    expect(fitted.height).toBe(200);
    const tall = fittedSize(400, 800);
    expect(tall.height).toBe(SIGNATURE_MAX_HEIGHT);
    expect(tall.width).toBe(200);
    // Small images are never upscaled (no stretched handwriting).
    expect(fittedSize(300, 100)).toEqual({ width: 300, height: 100 });
  });

  it('accepts normal image uploads and rejects the rest', () => {
    expect(validateSignatureUpload(new File([new Uint8Array(10)], 's.png', { type: 'image/png' }))).toBeNull();
    expect(validateSignatureUpload(new File([new Uint8Array(10)], 's.jpg', { type: 'image/jpeg' }))).toBeNull();
    expect(validateSignatureUpload(new File([new Uint8Array(10)], 's.gif', { type: 'image/gif' }))).not.toBeNull();
    expect(validateSignatureUpload(new File([new Uint8Array(10)], 's.pdf', { type: 'application/pdf' }))).not.toBeNull();
  });
});

describe('signature storage contract', () => {
  it('paths are org/user scoped — the folders the policies authorize on', () => {
    expect(staffSignaturePath('org-1', 'user-9')).toBe('org-1/user-9/signature.png');
  });
});

describe('signature security (migration policies)', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase', 'migrations', '20260807120000_letterhead_correspondence.sql'),
    'utf8',
  );

  it('the bucket is private with PNG-only uploads', () => {
    expect(migration).toMatch(/VALUES \('staff-signatures', 'staff-signatures', false/);
    expect(migration).toContain("ARRAY['image/png']");
  });

  it('every signature-row write binds to the authenticated user', () => {
    expect(migration).toMatch(/staff_signatures FOR INSERT[\s\S]*?user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/staff_signatures FOR UPDATE[\s\S]*?user_id = auth\.uid\(\)[\s\S]*?WITH CHECK[\s\S]*?user_id = auth\.uid\(\)/);
    expect(migration).toMatch(/staff_signatures FOR DELETE[\s\S]*?user_id = auth\.uid\(\)/);
    // No admin-manages-others policy exists for this table.
    expect(migration).not.toMatch(/staff_signatures[\s\S]{0,400}?is_org_admin/);
  });

  it('storage writes are restricted to your own org/user folder', () => {
    expect(migration).toMatch(
      /Users upload own staff signature[\s\S]*?\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text[\s\S]*?is_org_member\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)/,
    );
  });

  it("reading a teammate's ink requires their allow_office_use consent, same org", () => {
    expect(migration).toMatch(
      /Members read authorized staff signatures[\s\S]*?is_org_member[\s\S]*?allow_office_use/,
    );
    // Cross-org reads are impossible: the only other read path is your own folder.
    expect(migration).toMatch(
      /Users read own staff signature[\s\S]*?\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/,
    );
  });

  it('the metadata row can never point outside its own org/user folder', () => {
    expect(migration).toContain(
      "storage_path = org_id::text || '/' || user_id::text || '/signature.png'",
    );
  });
});

describe('staff signatures never touch patient signature privacy', () => {
  it('the consent pad and packet keep their memory-only contract', () => {
    const capture = readFileSync(
      join(process.cwd(), 'src', 'components', 'consents', 'SignatureCapture.tsx'),
      'utf8',
    );
    // The consent wrapper must not import any persistence hooks or clients.
    expect(capture).not.toMatch(/useStaffSignature|useSaveMySignature|supabase|letterDb/);
    expect(capture).toContain('memory-only');
  });

  it('the shared drawing primitive is persistence-agnostic', () => {
    const primitive = readFileSync(
      join(process.cwd(), 'src', 'components', 'signature', 'SignaturePadCanvas.tsx'),
      'utf8',
    );
    expect(primitive).not.toMatch(/supabase|letterDb|localStorage|sessionStorage|fetch\(/);
  });

  it('only the staff card, and never the consent flow, saves signatures', () => {
    const card = readFileSync(
      join(process.cwd(), 'src', 'components', 'letterhead', 'MySignatureCard.tsx'),
      'utf8',
    );
    expect(card).toContain('useSaveMySignature');
    const completeForms = readFileSync(join(process.cwd(), 'src', 'pages', 'CompleteForms.tsx'), 'utf8');
    expect(completeForms).not.toMatch(/useSaveMySignature|staff_signatures|staffSignaturePath/);
  });
});
