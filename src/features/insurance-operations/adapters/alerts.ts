/** No notification fields accept task content. Nothing enters durable push storage. */
export class InsuranceAlerts {
  private sent = new Set<string>();
  private notifications = new Set<Notification>();
  async enable(): Promise<NotificationPermission | 'unsupported'> {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.requestPermission();
  }
  show(key: string, attention: boolean, sound = false) {
    if (this.sent.has(key)) return;
    this.sent.add(key);
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      const notification = new Notification(
        attention
          ? 'Insurance task needs attention'
          : 'Insurance tasks finished',
      );
      this.notifications.add(notification);
      notification.onclick = () => {
        window.focus();
        notification.close();
        this.notifications.delete(notification);
      };
    }
    if (sound && typeof AudioContext !== 'undefined') {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.06;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.15);
      oscillator.onended = () => {
        void context.close();
      };
    }
  }
  clear() {
    this.notifications.forEach((n) => n.close());
    this.notifications.clear();
    this.sent.clear();
  }
}
