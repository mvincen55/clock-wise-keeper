import { useOrgBranding, GENERIC_BRANDING } from '@/hooks/useOrgBranding';

/**
 * Applies the office's approved accent color to the app shell as CSS
 * variables, so the signed-in experience carries the office's identity
 * (blueprint §3, §9). De-identified configuration only — this reads the
 * org_branding row, never anything patient-related.
 */

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export default function OfficeBrandStyle() {
  const { data: branding } = useOrgBranding();
  const color = branding?.brandColor || GENERIC_BRANDING.brandColor;
  const hsl = hexToHsl(color);
  if (!hsl) return null;

  const token = `${hsl.h} ${hsl.s}% ${hsl.l}%`;
  // Keep button text readable whatever accent the office picked.
  const foreground = hsl.l > 60 ? '220 25% 12%' : '0 0% 100%';

  return (
    <style>{`:root {
  --primary: ${token};
  --primary-foreground: ${foreground};
  --ring: ${token};
  --sidebar-primary: ${hsl.h} ${Math.min(hsl.s + 6, 100)}% ${Math.min(hsl.l + 20, 78)}%;
}`}</style>
  );
}
