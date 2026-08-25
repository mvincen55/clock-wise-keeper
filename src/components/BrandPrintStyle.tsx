import type { OrgBranding } from '@/hooks/useOrgBranding';

/**
 * Injects the org's brand accent into the print/preview sheets by
 * overriding the CSS custom properties the .fof-sheet / .dep-sheet rules
 * are written against. Rendered as a sibling of the sheets so the sheet
 * DOM itself stays byte-identical regardless of branding.
 */
export default function BrandPrintStyle({
  branding,
}: {
  branding: Pick<OrgBranding, 'brandColor' | 'brandTint'>;
}) {
  const css = `.fof-sheet{--fof-navy:${branding.brandColor};--fof-tint:${branding.brandTint}}
.dep-sheet{--dep-navy:${branding.brandColor};--dep-tint:${branding.brandTint}}
.inc-sheet{--inc-navy:${branding.brandColor};--inc-tint:${branding.brandTint}}
.goal-sheet{--goal-navy:${branding.brandColor};--goal-tint:${branding.brandTint}}
.cf-sheet{--cf-navy:${branding.brandColor};--cf-tint:${branding.brandTint}}
.letter-sheet{--letter-navy:${branding.brandColor};--letter-tint:${branding.brandTint}}
.abx-sheet{--abx-navy:${branding.brandColor};--abx-tint:${branding.brandTint}}
.onb-sheet{--onb-navy:${branding.brandColor};--onb-tint:${branding.brandTint}}`;
  return <style>{css}</style>;
}
