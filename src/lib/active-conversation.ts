/**
 * Which conversations are open on screen right now.
 *
 * The Messages page and the floating chat dock both register the thread they
 * are showing; the corner popups consult this so a message you are already
 * reading never also pops up over it. A plain module map is enough — this is
 * presence bookkeeping, not state anyone renders from.
 */

const openCounts = new Map<string, number>();

export function markConversationOpen(id: string): void {
  openCounts.set(id, (openCounts.get(id) ?? 0) + 1);
}

export function markConversationClosed(id: string): void {
  const next = (openCounts.get(id) ?? 0) - 1;
  if (next <= 0) openCounts.delete(id);
  else openCounts.set(id, next);
}

export function isConversationOnScreen(id: string | null | undefined): boolean {
  return !!id && openCounts.has(id);
}

/**
 * Ask the browser for permission to show desktop notifications. Called from
 * a user interaction with the chat surfaces (opening the dock, opening
 * Messages) so the prompt appears in context rather than at page load.
 */
export function requestDesktopNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    // Fire-and-forget; the popup layer re-checks permission every time.
    Notification.requestPermission().catch(() => undefined);
  }
}
