import { Link, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';

// Reader pages that lock their panes to the viewport — a footer below them
// would only re-introduce page scroll under the locked layout.
const LOCKED_READER_ROUTES = ['/handbook', '/insurance-desk'];

/**
 * Discreet product attribution (blueprint §3): the office owns the shell —
 * its name stands alone on the left — and Purple Envelope signs the right
 * side, carrying the copyright alongside Help, privacy, and support.
 */
export default function AppFooter() {
  const { data: branding } = useOrgBranding();
  const { data: ctx } = useOrgContext();
  const { pathname } = useLocation();
  const officeName = branding?.legalName || branding?.displayName || ctx?.org_name || '';

  if (LOCKED_READER_ROUTES.includes(pathname)) return null;

  return (
    <footer className="hidden md:flex items-center justify-between gap-4 border-t bg-card px-6 py-3 text-xs text-muted-foreground">
      <p className="truncate">{officeName}</p>
      <nav className="flex items-center gap-4 shrink-0">
        <Link to="/help" className="hover:text-foreground transition-colors">Help &amp; Support</Link>
        <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy &amp; Terms</Link>
        <span className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-primary" />
          © {new Date().getFullYear()} Purple Envelope
        </span>
      </nav>
    </footer>
  );
}
