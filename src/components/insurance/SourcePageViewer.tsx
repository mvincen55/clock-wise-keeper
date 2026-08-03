/**
 * SourcePageViewer — the original PDF, page by page.
 *
 * The clean reader is a convenience; the carrier's PDF is the authority.
 * This viewer renders the stored original with pdfjs (nothing leaves the
 * browser), opens at the exact source page, zooms, steps pages, and can
 * open the full PDF in a new tab for the browser's own find/print. On
 * mobile it takes over the full screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { destroyPdf, loadPdf, renderPdfPageToCanvas } from '@/lib/manual-pdf';

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5];

export default function SourcePageViewer({
  open,
  onClose,
  pdfBlob,
  pdfUrl,
  title,
  page,
  onPageChange,
}: {
  open: boolean;
  onClose: () => void;
  pdfBlob: Blob | null;
  /** Object URL for "open full PDF" (browser viewer with its own search). */
  pdfUrl: string | null;
  title: string;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSeq = useRef(0);

  // Load the document once per blob while the viewer is open.
  useEffect(() => {
    if (!open || !pdfBlob) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setError(null);
    (async () => {
      try {
        loaded = await loadPdf(await pdfBlob.arrayBuffer());
        if (!cancelled) setDoc(loaded);
      } catch {
        if (!cancelled) setError('The original PDF could not be opened.');
      }
    })();
    return () => {
      cancelled = true;
      setDoc(null);
      if (loaded) destroyPdf(loaded);
    };
  }, [open, pdfBlob]);

  const renderPage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    const seq = ++renderSeq.current;
    setRendering(true);
    try {
      const size = await renderPdfPageToCanvas(doc, page, canvas, ZOOM_STEPS[zoomIndex]);
      if (seq === renderSeq.current) {
        canvas.style.width = `${size.width}px`;
        canvas.style.height = `${size.height}px`;
      }
    } catch {
      if (seq === renderSeq.current) setError('This page could not be rendered.');
    } finally {
      if (seq === renderSeq.current) setRendering(false);
    }
  }, [doc, page, zoomIndex]);

  useEffect(() => {
    void renderPage();
  }, [renderPage]);

  const pageCount = doc?.numPages ?? 0;
  const clampPage = (p: number) => Math.min(Math.max(1, p), Math.max(1, pageCount));

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent
        hideClose
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:h-[90vh] sm:max-h-[90vh] sm:w-[min(64rem,96vw)] sm:rounded-2xl"
      >
        {/* Toolbar */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title} — original PDF
          </DialogTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => onPageChange(clampPage(page - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[5.5rem] text-center text-xs tabular-nums text-muted-foreground">
              Page {page}
              {pageCount > 0 ? ` of ${pageCount}` : ''}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pageCount > 0 && page >= pageCount}
              onClick={() => onPageChange(clampPage(page + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex(i => Math.max(0, i - 1))}
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(ZOOM_STEPS[zoomIndex] * 100)}%
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              onClick={() => setZoomIndex(i => Math.min(ZOOM_STEPS.length - 1, i + 1))}
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {pdfUrl && (
            <Button variant="outline" size="sm" className="h-8" asChild>
              <a href={pdfUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Full PDF
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Back to reader">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Page canvas */}
        <div className="relative min-h-0 flex-1 overflow-auto bg-muted/40 p-4">
          {error ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{error}</p>
          ) : !doc ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex min-w-fit justify-center">
              <canvas
                ref={canvasRef}
                className="rounded-md bg-white shadow-md ring-1 ring-border"
              />
            </div>
          )}
          {rendering && doc && (
            <div className="pointer-events-none absolute right-3 top-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
        </div>
        <p className="shrink-0 border-t border-border px-4 py-1.5 text-center text-[11px] text-muted-foreground">
          The original PDF is the authoritative version of this manual.
        </p>
      </DialogContent>
    </Dialog>
  );
}
