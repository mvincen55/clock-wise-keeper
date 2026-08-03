import { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import type { OrgBranding } from '@/hooks/useOrgBranding';

/**
 * Printing plumbing for Forms & Consents.
 *
 * House rule (see index.css @media print): the print root must be a direct
 * child of <body> — Radix portals dialogs as siblings of #root, so hiding
 * only #root would print the open dialog too. `ConsentPrintRoot` portals
 * the sheets to <body>; the CSS shows exactly that root when printing.
 */

export function ConsentPrintRoot({ children }: { children: ReactNode }) {
  return createPortal(<div className="consent-print-root">{children}</div>, document.body);
}

/**
 * Preview dialog whose on-screen preview IS the print sheet, scaled to fit —
 * what you see is what prints. The same sheet element rides in the print
 * root while the dialog is open.
 */
export function ConsentPreviewDialog({
  open,
  onOpenChange,
  title,
  description,
  sheet,
  branding,
  printLabel = 'Print',
  canPrint = true,
  footerExtra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  sheet: ReactNode;
  branding: Pick<OrgBranding, 'brandColor' | 'brandTint'>;
  printLabel?: string;
  canPrint?: boolean;
  footerExtra?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? 'The preview matches the printed page exactly.'}
          </DialogDescription>
        </DialogHeader>
        <BrandPrintStyle branding={branding} />
        <div className="flex-1 overflow-y-auto rounded-lg bg-muted/50 p-3">
          <ScaledPrintPreview>{sheet}</ScaledPrintPreview>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="min-w-0 text-xs text-muted-foreground">{footerExtra}</div>
          {canPrint && (
            <Button onClick={() => window.print()} className="shrink-0">
              <Printer className="mr-2 h-4 w-4" />
              {printLabel}
            </Button>
          )}
        </div>
        {open && <ConsentPrintRoot>{sheet}</ConsentPrintRoot>}
      </DialogContent>
    </Dialog>
  );
}
