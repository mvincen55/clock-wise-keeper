import { afterEach, expect, it, vi } from 'vitest';
import { InsuranceAlerts } from './alerts';
afterEach(() => vi.unstubAllGlobals());
it('uses only generic notification text, deduplicates outcomes and focuses without navigation', () => {
  const calls: string[] = [];
  const instances: MockNotification[] = [];
  class MockNotification {
    static permission = 'granted';
    onclick: () => void = () => {};
    close = vi.fn();
    constructor(title: string) {
      calls.push(title);
      instances.push(this);
    }
  }
  vi.stubGlobal('Notification', MockNotification);
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});
  const alerts = new InsuranceAlerts();
  alerts.show('internal-task-id', false);
  alerts.show('internal-task-id', false);
  alerts.show('other', true);
  expect(calls).toEqual([
    'Insurance tasks finished',
    'Insurance task needs attention',
  ]);
  instances[0].onclick();
  expect(focus).toHaveBeenCalledOnce();
  alerts.clear();
  expect(instances[1].close).toHaveBeenCalledOnce();
  focus.mockRestore();
});
it('handles denied permissions without creating notifications', async () => {
  const ctor = vi.fn();
  Object.assign(ctor, {
    permission: 'denied',
    requestPermission: async () => 'denied',
  });
  vi.stubGlobal('Notification', ctor);
  const alerts = new InsuranceAlerts();
  expect(await alerts.enable()).toBe('denied');
  alerts.show('outcome', true);
  expect(ctor).not.toHaveBeenCalled();
});
