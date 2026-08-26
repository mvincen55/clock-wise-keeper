import type { OrgBranding } from '@/hooks/useOrgBranding';

/**
 * Printable BLANK onboarding checklist — a template exactly as an office
 * would pin it to a clipboard: every section and item, an initials + date
 * slot for the trainer and the new team member on each line. Pure props →
 * JSX; rendered via portal only while printing (.onboarding-print-root in
 * index.css). Employment/business content only; no patient data.
 *
 * Branding rides the same pipeline as the FOF print: the org logo carries
 * the letterhead, with the practice name as the text fallback when no logo
 * is set (useOrgBranding → logoUrl).
 */

export interface TemplatePrintSection {
  id: string;
  title: string;
  items: Array<{ id: string; title: string; detail: string }>;
}

export interface OnboardingTemplatePrintProps {
  templateName: string;
  roleLabel: string;
  sections: TemplatePrintSection[];
  branding: Pick<
    OrgBranding,
    'displayName' | 'legalName' | 'addressLine1' | 'addressLine2' | 'phone' | 'website' | 'logoUrl'
  >;
}

export default function OnboardingTemplatePrintSheet({
  templateName,
  roleLabel,
  sections,
  branding,
}: OnboardingTemplatePrintProps) {
  return (
    <div className="onb-sheet">
      <header className="onb-head">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.displayName} className="onb-logo" />
        ) : (
          <p className="onb-practice">{branding.displayName || branding.legalName}</p>
        )}
        <div className="onb-head-meta">
          <p className="onb-title">Onboarding Checklist</p>
          {roleLabel && (
            <div className="onb-meta-item">
              <span className="onb-meta-key">Role</span>
              <span className="onb-meta-value">{roleLabel}</span>
            </div>
          )}
          <div className="onb-meta-item">
            <span className="onb-meta-key">Checklist</span>
            <span className="onb-meta-value">{templateName}</span>
          </div>
        </div>
      </header>

      {/* Filled in by hand on paper; the app fills them on the record print. */}
      <div className="onb-who">
        <span className="onb-who-slot">
          <span className="onb-who-line" />
          <span className="onb-who-label">Team member</span>
        </span>
        <span className="onb-who-slot">
          <span className="onb-who-line" />
          <span className="onb-who-label">Start date</span>
        </span>
      </div>

      <div className="onb-legend">
        <span>Each item is signed off twice: by the trainer and by the new team member.</span>
        <span className="onb-legend-cols">
          <span>Trainer</span>
          <span>Team member</span>
        </span>
      </div>

      {sections.map(section => (
        <section key={section.id} className="onb-section">
          <h2 className="onb-section-title">{section.title}</h2>
          {section.items.map(item => (
            <div key={item.id} className="onb-item">
              <div className="onb-item-text">
                <p className="onb-item-title">{item.title}</p>
                {item.detail && <p className="onb-item-detail">{item.detail}</p>}
              </div>
              <div className="onb-item-signs">
                <span className="onb-sign-slot">
                  <span className="onb-sign-line" />
                  <span className="onb-sign-label">Initials / date</span>
                </span>
                <span className="onb-sign-slot">
                  <span className="onb-sign-line" />
                  <span className="onb-sign-label">Initials / date</span>
                </span>
              </div>
            </div>
          ))}
        </section>
      ))}

      <p className="onb-foot">
        {branding.legalName || branding.displayName}
        {' · '}Onboarding record — retained in the team member&apos;s employment file.
      </p>

      <footer className="onb-footer">
        {(branding.addressLine1 || branding.addressLine2) && (
          <span className="onb-footer-item">
            {[branding.addressLine1, branding.addressLine2].filter(Boolean).join(', ')}
          </span>
        )}
        {branding.phone && <span className="onb-footer-item">{branding.phone}</span>}
        {branding.website && <span className="onb-footer-item">{branding.website}</span>}
      </footer>
    </div>
  );
}
