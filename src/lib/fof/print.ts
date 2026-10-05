/** Compose and validate only the selected print job, before opening the dialog. */
export const FOF_PREPARE_PRINT = 'fof:prepare-print';

export function prepareFofPrint(root: HTMLElement | null): string | null {
  if (!root) return 'The print form is not ready yet. Please try again.';
  // The normal portal is display:none. Measure at paper width without showing
  // it on screen; patient-preview warnings cannot block an office-only job.
  root.setAttribute('data-fof-preparing', '');
  try {
    root.dispatchEvent(new Event(FOF_PREPARE_PRINT));
    const issue = root.querySelector('.fof-layout-review');
    return issue ? issue.textContent || 'Review the form layout before printing.' : null;
  } finally {
    root.removeAttribute('data-fof-preparing');
  }
}

/**
 * Run `fn` with the hidden print portal laid out at paper width. The browser
 * fires `beforeprint` while the page is still styled for the screen, where the
 * portal is display:none and measures as 0px — so anything composed for the
 * printer has to be measured under this flag, exactly as prepareFofPrint does.
 * A root already being prepared keeps its flag.
 */
export function withMeasurablePrintRoot<T>(root: Element | null, fn: () => T): T {
  if (!root || root.hasAttribute('data-fof-preparing')) return fn();
  root.setAttribute('data-fof-preparing', '');
  try {
    return fn();
  } finally {
    root.removeAttribute('data-fof-preparing');
  }
}

/**
 * Attributes for the portaled print root. Chromium prints a tab at its zoom
 * level (a 67% tab prints a two-thirds-size form); the stylesheet undoes that
 * on paper, but only where the engine is known to behave that way — other
 * engines already print at 100%, and their print viewport units differ.
 */
export function fofPrintRootProps(): { className: string; 'data-fof-zoom-compensate'?: string } {
  const chromium = typeof navigator !== 'undefined' && 'userAgentData' in navigator;
  return chromium ? { className: 'fof-print-root', 'data-fof-zoom-compensate': '' } : { className: 'fof-print-root' };
}
