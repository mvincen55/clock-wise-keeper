import type { OrgBranding } from '@/hooks/useOrgBranding';
import type { LetterRecipient, LetterSigner } from '@/lib/letters/types';

/**
 * THE office letterhead — the one canonical print layout for every letter
 * Purple Envelope produces (Broken Appointment letters, Write on Letterhead,
 * School/Work notes, and future correspondence). Features provide content
 * via props; this component owns the structure: logo-only masthead,
 * right-aligned long-form dateline, recipient block (blank lines collapse),
 * salutation, subject, body, closing with optional real-signature ink,
 * enclosure, and the practice-identity footer.
 *
 * Pure props → JSX with no hooks or fetching (FofPrintSheet pattern);
 * rendered once as the on-screen preview and once via portal
 * (.letter-print-root) as the print output so the two can never diverge.
 * Styled by the .letter-* rules in index.css (pt/in units, US Letter).
 * Practice identity comes only from org_branding — never hard-coded.
 *
 * HIPAA boundary: recipient/patient values arrive as props from React state
 * only — never persisted or transmitted (see src/lib/letters/types.ts).
 */

export type LetterheadBranding = Pick<
  OrgBranding,
  'displayName' | 'legalName' | 'addressLine1' | 'addressLine2' | 'phone' | 'website' | 'logoUrl'
>;

export interface OfficeLetterheadSheetProps {
  branding: LetterheadBranding;
  /** Long-form dateline, e.g. "August 7, 2026" (formatLetterDate). */
  dateText: string;
  /** Omit (or pass all-blank) for letters that are not mailed. */
  recipient?: LetterRecipient | null;
  /** e.g. "Dear Ann," / "To Whom It May Concern:" — omit for none. */
  salutation?: string;
  /** Optional RE: line. */
  subject?: string;
  /** Letter content — typically <LetterBodyContent markup={...} />. */
  body: React.ReactNode;
  signer: LetterSigner;
  /** e.g. "Enclosure: Account Statement" — omit for none. */
  enclosure?: string;
  /**
   * Extra pages after the letter (each child should carry
   * .letter-attach-page so it starts on its own sheet).
   */
  attachment?: React.ReactNode;
}

/** Non-blank recipient lines in standard order; [] hides the whole block. */
export function recipientLines(recipient: LetterRecipient | null | undefined): string[] {
  if (!recipient) return [];
  const cityLine = [
    recipient.city.trim(),
    [recipient.state.trim(), recipient.zip.trim()].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');
  return [
    recipient.name.trim(),
    recipient.addressLine1.trim(),
    recipient.addressLine2.trim(),
    cityLine,
  ].filter(line => line !== '');
}

export default function OfficeLetterheadSheet({
  branding,
  dateText,
  recipient,
  salutation,
  subject,
  body,
  signer,
  enclosure,
  attachment,
}: OfficeLetterheadSheetProps) {
  const practiceName = branding.legalName.trim() || branding.displayName.trim();
  const addressLines = recipientLines(recipient);

  const footParts = [
    branding.addressLine1.trim(),
    branding.addressLine2.trim(),
    branding.phone.trim(),
    branding.website.trim(),
  ].filter(Boolean);

  const hasInk = !!signer.signatureDataUrl;

  return (
    <div className="letter-sheet">
      <header className="letter-masthead">
        {branding.logoUrl !== '' ? (
          <img className="letter-logo" src={branding.logoUrl} alt={practiceName} />
        ) : (
          <div className="letter-masthead-name">{practiceName}</div>
        )}
      </header>

      <div className="letter-dateline">{dateText}</div>

      {addressLines.length > 0 && (
        <div className="letter-recipient">
          {addressLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {subject && subject.trim() !== '' && (
        <div className="letter-subject">RE: {subject.trim()}</div>
      )}

      {salutation && salutation.trim() !== '' && (
        <p className="letter-salutation">{salutation.trim()}</p>
      )}

      <div className="letter-body">{body}</div>

      <div className="letter-closing">
        <div className="letter-closing-phrase">{signer.closing.trim() || 'Sincerely,'}</div>
        {hasInk && (
          // The stored asset is pre-normalized (cropped, transparent); the
          // CSS bounds below keep every signature at the same footprint.
          <img className="letter-ink" src={signer.signatureDataUrl!} alt="" />
        )}
        <div className={hasInk ? 'letter-signer-name' : 'letter-signer-name letter-signer-name--typed'}>
          {signer.name.trim() || practiceName}
        </div>
        {signer.title.trim() !== '' && (
          <div className="letter-signer-title">{signer.title.trim()}</div>
        )}
      </div>

      {enclosure && enclosure.trim() !== '' && (
        <div className="letter-enclosure">{enclosure.trim()}</div>
      )}

      <footer className="letter-foot">
        <div className="letter-foot-name">{practiceName}</div>
        {footParts.length > 0 && <div className="letter-foot-meta">{footParts.join(' • ')}</div>}
      </footer>

      {attachment}
    </div>
  );
}
