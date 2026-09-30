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
