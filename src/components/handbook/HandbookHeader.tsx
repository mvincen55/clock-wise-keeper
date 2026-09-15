import { Link } from 'react-router-dom';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';

/** Identity and utility actions shared only by the two employee handbook paths. */
export default function HandbookHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const practice = branding?.displayName || ctx?.org_name || 'Your practice';
  return (
    <header className="handbook-header">
      {/* The practice's own mark, as it appears across the app — never a stock image. */}
      {branding?.logoUrl && <img className="handbook-logo" src={branding.logoUrl} alt="" width={56} height={56} />}
      <div className="handbook-heading">
        <p className="handbook-eyebrow">{practice} <span aria-hidden="true"> / </span> Team reference</p>
        <h1>{title}</h1>
        <p className="handbook-description">{subtitle}</p>
      </div>
      <div className="handbook-utilities">
        <Link to="/assistant?scope=handbook">Ask about this handbook <span aria-hidden="true">↗</span></Link>
        <p>Answers help you find information.<br />The handbook remains the official text.</p>
      </div>
    </header>
  );
}
