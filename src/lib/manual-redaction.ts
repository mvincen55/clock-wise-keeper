/**
 * Manual redaction.
 *
 * Automatic masking is a good first pass, never the last word. Here a person
 * can paint their own boxes over anything the reader missed — or uncover an
 * area the reader was too eager about, so the help desk can actually see the
 * thing being reported. Everything happens on this device; the composed file
 * is what gets uploaded.
 */

export type BoxTool = 'mask' | 'reveal';

/** A box in normalized (0–1) image coordinates, so zoom never matters. */
export interface RedactionBox {
  id: string;
  tool: BoxTool;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MASK_FILL = '#2b2433';

function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      setTimeout(() => URL.revokeObjectURL(url), 0);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image.'));
    };
    img.src = url;
  });
}

export function normalizeBox(box: RedactionBox): RedactionBox {
  const x = Math.min(box.x, box.x + box.w);
  const y = Math.min(box.y, box.y + box.h);
  return {
    ...box,
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    w: Math.min(Math.abs(box.w), 1 - Math.max(0, Math.min(1, x))),
    h: Math.min(Math.abs(box.h), 1 - Math.max(0, Math.min(1, y))),
  };
}

/**
 * Build the file that will actually be sent: the auto-redacted image as the
 * base, original pixels painted back inside "reveal" boxes, then solid blocks
 * over every "mask" box on top. Masks always win over reveals.
 */
export async function composeRedaction(
  original: File,
  autoRedacted: File | null,
  boxes: RedactionBox[],
): Promise<{ file: File; previewUrl: string }> {
  const base = await loadImage(autoRedacted ?? original);
  const canvas = document.createElement('canvas');
  canvas.width = base.naturalWidth;
  canvas.height = base.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the image.');
  ctx.drawImage(base, 0, 0);

  const reveals = boxes.map(normalizeBox).filter(b => b.tool === 'reveal' && b.w > 0 && b.h > 0);
  if (reveals.length > 0 && autoRedacted) {
    const raw = await loadImage(original);
    for (const b of reveals) {
      const x = b.x * canvas.width;
      const y = b.y * canvas.height;
      const w = b.w * canvas.width;
      const h = b.h * canvas.height;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(raw, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  }

  ctx.fillStyle = MASK_FILL;
  for (const b of boxes.map(normalizeBox)) {
    if (b.tool !== 'mask' || b.w <= 0 || b.h <= 0) continue;
    ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height);
  }

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Could not finish the redaction.');
  const file = new File([blob], original.name.replace(/\.[^.]+$/, '') + '-redacted.png', {
    type: 'image/png',
  });
  return { file, previewUrl: URL.createObjectURL(file) };
}
