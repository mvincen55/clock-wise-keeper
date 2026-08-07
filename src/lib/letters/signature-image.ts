/**
 * Staff-signature image normalization — pure pixel math plus a browser
 * canvas pipeline.
 *
 * Whatever a person draws or uploads (transparent PNG, JPEG photo of a
 * signature on paper, oversized scan), the stored asset comes out the same
 * way: transparent background, cropped to the ink, bounded to a sane size,
 * PNG. Letters then render every signature at a consistent visual footprint
 * without anyone hand-sizing their handwriting.
 *
 * This file handles STAFF signatures (stored business assets) only. Patient
 * consent signatures stay memory-only in the Complete Forms workflow and
 * never pass through here.
 */

/** Stored asset bounds — comfortably above print resolution for a 2.2in slot. */
export const SIGNATURE_MAX_WIDTH = 1200;
export const SIGNATURE_MAX_HEIGHT = 400;

/** Alpha below this counts as background when cropping. */
const ALPHA_INK_THRESHOLD = 16;
/** A pixel at least this bright (every channel) counts as paper, not ink. */
const WHITE_THRESHOLD = 235;

export const SIGNATURE_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const SIGNATURE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export function validateSignatureUpload(file: File): string | null {
  if (!(SIGNATURE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return 'Use a PNG, JPEG, or WebP image of your signature.';
  }
  if (file.size <= 0 || file.size > SIGNATURE_UPLOAD_MAX_BYTES) {
    return 'Signature images must be under 8MB.';
  }
  return null;
}

/** Minimal ImageData shape so the pixel math is testable without a browser. */
export interface PixelGrid {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  data: Uint8ClampedArray;
}

/** True when the pixel reads as ink (not transparent, not paper-white). */
export function isInkPixel(grid: PixelGrid, x: number, y: number): boolean {
  const i = (y * grid.width + x) * 4;
  const [r, g, b, a] = [grid.data[i], grid.data[i + 1], grid.data[i + 2], grid.data[i + 3]];
  if (a < ALPHA_INK_THRESHOLD) return false;
  return !(r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD);
}

export interface InkBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Bounding box of the ink, or null for an empty/blank image. */
export function inkBounds(grid: PixelGrid): InkBounds | null {
  let left = grid.width;
  let top = grid.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (!isInkPixel(grid, x, y)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { left, top, right, bottom };
}

/**
 * Make paper-white pixels transparent in place (for JPEG/photo sources with
 * no alpha channel), leaving anti-aliased ink edges intact.
 */
export function whiteToTransparent(grid: PixelGrid): void {
  for (let i = 0; i < grid.data.length; i += 4) {
    if (
      grid.data[i] >= WHITE_THRESHOLD &&
      grid.data[i + 1] >= WHITE_THRESHOLD &&
      grid.data[i + 2] >= WHITE_THRESHOLD
    ) {
      grid.data[i + 3] = 0;
    }
  }
}

/** Target size for a cropped ink box, preserving aspect ratio. */
export function fittedSize(
  width: number,
  height: number,
  maxW = SIGNATURE_MAX_WIDTH,
  maxH = SIGNATURE_MAX_HEIGHT,
): { width: number; height: number } {
  const scale = Math.min(1, maxW / width, maxH / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Crop margin so ink never touches the asset edge. */
const CROP_PAD = 6;

/**
 * Browser pipeline: decode → flatten paper white to transparency → crop to
 * the ink → scale into bounds → transparent PNG blob. Returns null when the
 * image contains no visible ink.
 */
export async function normalizeSignatureImage(source: Blob): Promise<Blob | null> {
  const bitmap = await decodeToCanvas(source);
  if (!bitmap) return null;
  const { canvas, ctx } = bitmap;

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  whiteToTransparent(image);
  const bounds = inkBounds(image);
  if (!bounds) return null;
  ctx.putImageData(image, 0, 0);

  const cropX = Math.max(0, bounds.left - CROP_PAD);
  const cropY = Math.max(0, bounds.top - CROP_PAD);
  const cropW = Math.min(canvas.width, bounds.right + CROP_PAD + 1) - cropX;
  const cropH = Math.min(canvas.height, bounds.bottom + CROP_PAD + 1) - cropY;
  const target = fittedSize(cropW, cropH);

  const out = document.createElement('canvas');
  out.width = target.width;
  out.height = target.height;
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, target.width, target.height);

  return await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'));
}

/** Oversized sources are pre-scaled so getImageData stays affordable. */
const DECODE_MAX = 2400;

async function decodeToCanvas(
  source: Blob,
): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement | null>(resolve => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = url;
    });
    if (!img || img.naturalWidth === 0 || img.naturalHeight === 0) return null;

    const scale = Math.min(1, DECODE_MAX / img.naturalWidth, DECODE_MAX / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, ctx };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A blob as a data: URL (print portals must not depend on network URLs). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
