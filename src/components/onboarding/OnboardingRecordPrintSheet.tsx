import type { OrgBranding } from '@/hooks/useOrgBranding';
import {
  slotLabel,
  toSignoffState,
  type SignoffItemRow,
  type SignoffSlot,
} from '@/lib/onboarding-signoff';

/**
 * Printable onboarding RECORD — a hire's checklist as signed, complete or
 * in progress: initials, verification status, and dates on every slot.
 * PIN-verified sign-offs print as "PIN verified"; initials-fallback ones
 * print explicitly as "initials only — unverified"; unsigned slots print
 * the empty rule so the sheet can finish on paper. Pure props → JSX;
 * rendered via the .onboarding-print-root portal. Employment record — no
 * patient data.
 */

export interface RecordPrintItem extends SignoffItemRow {
  id: string;
  section_title: string;
  item_title: string;
  item_detail: string;
}

export interface OnboardingRecordPrintProps {
  employeeName: string;
  templateName: string;
  roleLabel: string;
  startedAt: string;
  status: string;
  completedAt: string | null;
  items: RecordPrintItem[];
  branding: Pick<
    OrgBranding,
    'displayName' | 'legalName' | 'addressLine1' | 'addressLine2' | 'phone' | 'website' | 'logoUrl'
  >;
}

const shortDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
};

function SignCell({ slot }: { slot: SignoffSlot }) {
  const label = slotLabel(slot);
  if (label === 'unsigned') {
    return (
      <span className="onb-sign-slot">
        <span className="onb-sign-line" />
        <span className="onb-sign-label">Initials / date</span>
      </span>
    );
  }
  return (
    <span className="onb-sign-slot">
      <span className="onb-sign-value">{slot.initials || '—'}</span>
      <span className="onb-sign-meta">{shortDate(slot.signed_at)}</span>
      <span className={`onb-sign-meta${label === 'unverified' ? ' onb-unverified' : ''}`}>
        {label === 'verified' ? 'PIN verified' : 'initials only — unverified'}
      </span>
    </span>
  );
}

export default function OnboardingRecordPrintSheet({
  employeeName,
  templateName,
  roleLabel,
  startedAt,
  status,
  completedAt,
  items,
  branding,
}: OnboardingRecordPrintProps) {
  const sections: Array<{ title: string; items: RecordPrintItem[] }> = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.title === item.section_title) last.items.push(item);
    else sections.push({ title: item.section_title, items: [item] });
  }

  return (
    <div className="onb-sheet">
      <header className="onb-head">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.displayName} className="onb-logo" />
        ) : (
          <p className="onb-practice">{branding.displayName || branding.legalName}</p>
        )}
        <div className="onb-head-meta">
          <p className="onb-title">Onboarding Record</p>
          <div className="onb-meta-item">
            <span className="onb-meta-key">Team member</span>
            <span className="onb-meta-value">{employeeName}</span>
          </div>
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
          <div className="onb-meta-item">
            <span className="onb-meta-key">Started</span>
            <span className="onb-meta-value">{shortDate(startedAt)}</span>
          </div>
          <div className="onb-meta-item">
            <span className="onb-meta-key">Status</span>
            <span className="onb-meta-value">
              {status === 'complete'
                ? `Complete${completedAt ? ` · ${shortDate(completedAt)}` : ''}`
                : 'In progress'}
            </span>
          </div>
        </div>
      </header>

      <div className="onb-legend">
        <span>
          Each item is signed off twice: by the trainer and by the new team member.
          PIN-verified sign-offs were confirmed with that person&apos;s server-checked PIN.
        </span>
        <span className="onb-legend-cols">
          <span>Trainer</span>
          <span>Team member</span>
        </span>
      </div>

      {sections.map(section => (
        <section key={section.title + section.items[0]?.id} className="onb-section">
          <h2 className="onb-section-title">{section.title}</h2>
          {section.items.map(item => {
            const state = toSignoffState(item);
            return (
              <div key={item.id} className="onb-item">
                <div className="onb-item-text">
                  <p className="onb-item-title">{item.item_title}</p>
                  {item.item_detail && <p className="onb-item-detail">{item.item_detail}</p>}
                </div>
                <div className="onb-item-signs">
                  <SignCell slot={state.trainer} />
                  <SignCell slot={state.trainee} />
                </div>
              </div>
            );
          })}
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
