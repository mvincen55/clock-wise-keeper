const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({
  channel: 'msedge',
  headless: false,
  ignoreDefaultArgs: [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
try {
  const context = await browser.newContext({
    permissions: ['notifications'],
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    window.__notificationEvidence = [];
    const Original = window.Notification;
    window.Notification = class extends Original {
      constructor(title, options) {
        super(title, options);
        this.addEventListener('show', () =>
          window.__notificationEvidence.push({
            event: 'show',
            title,
            body: options?.body ?? '',
          }),
        );
        this.addEventListener('error', () =>
          window.__notificationEvidence.push({ event: 'error', title }),
        );
      }
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    'http://127.0.0.1:8080/scripts/insurance-operations/synthetic-harness.html',
  );
  await page
    .getByRole('button', { name: 'Use synthetic test mode', exact: true })
    .click();
  await page.getByRole('button', { name: 'Load two synthetic rows' }).click();
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole('button', { name: 'Review row', exact: true })
      .nth(i)
      .click();
    await page
      .getByLabel('I reviewed the mapped fields, request scope and identifiers')
      .check();
    if (i === 0)
      await page.getByRole('button', { name: 'Hide details' }).click();
  }
  await page
    .getByRole('button', { name: 'Enable alerts', exact: true })
    .click();
  await page.evaluate(
    () => (document.title = 'Purple Envelope desktop acceptance 2'),
  );
  const cdp = await context.newCDPSession(page);
  console.log('READY_FOR_NATIVE_MINIMIZE');
  const nativeWindow = await cdp.send('Browser.getWindowForTarget');
  await cdp.send('Browser.setWindowBounds', {
    windowId: nativeWindow.windowId,
    bounds: { windowState: 'minimized' },
  });
  const deadline = Date.now() + 240000;
  let windowState;
  while (Date.now() < deadline) {
    windowState = (await cdp.send('Browser.getWindowForTarget')).bounds
      .windowState;
    if (windowState === 'minimized') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (windowState !== 'minimized')
    throw new Error('Native window was not minimized');
  await page
    .getByRole('button', { name: 'Start selected', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm Start', exact: true })
    .click();
  const startedState = (await cdp.send('Browser.getWindowForTarget')).bounds
    .windowState;
  await page.getByText('Partial', { exact: true }).waitFor({ timeout: 45000 });
  await new Promise((r) => setTimeout(r, 2000));
  const completedState = (await cdp.send('Browser.getWindowForTarget')).bounds
    .windowState;
  const notifications = await page.evaluate(
    () => window.__notificationEvidence,
  );
  const evidence = {
    nativeMinimizeBeforeStart: windowState,
    windowStateAtStart: startedState,
    windowStateAtCompletion: completedState,
    visibility: await page.evaluate(() => document.visibilityState),
    notifications,
    errors,
  };
  writeFileSync(
    'outputs/desktop-validation.json',
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
  if (startedState !== 'minimized' || completedState !== 'minimized')
    throw new Error('Window did not remain minimized');
  if (!notifications.some((event) => event.event === 'show' && event.body === ''))
    throw new Error('Native notification did not show with an empty body');
  if (notifications.some((event) => event.event === 'error') || errors.length)
    throw new Error('Desktop acceptance reported a notification or page error');
  console.log('COMPLETE_AWAITING_TOAST_OBSERVATION');
  await new Promise((r) => setTimeout(r, 20000));
} finally {
  await browser.close();
}
