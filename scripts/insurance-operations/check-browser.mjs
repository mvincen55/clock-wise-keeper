const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
import { writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
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
await page
  .getByLabel('Default payer (confirm after import)')
  .selectOption('00000000-0000-4000-8000-000000000001');
const today = new Date().toISOString().slice(0, 10),
  year = today.slice(0, 4);
await page
  .getByLabel('Paste CSV or a tab-separated table')
  .fill(
    'patientName,memberId,birthDate,serviceDate,groupRaw,product,subgroup,network,benefitYear\nSynthetic Patient A,00001,1990-01-01,' +
      today +
      ',00042,Demo PPO,A,Demo network,' +
      year +
      '\nSynthetic Patient B,00002,1990-01-01,' +
      today +
      ',00042,Demo PPO,A,Demo network,' +
      year,
  );
await page
  .getByRole('button', { name: 'Review pasted columns', exact: true })
  .click();
await page
  .getByRole('button', { name: 'Add 2 rows for review', exact: true })
  .click();
for (let i = 0; i < 2; i++) {
  await page
    .getByRole('button', { name: 'Review row', exact: true })
    .nth(i)
    .click();
  await page
    .getByLabel('Request', { exact: true })
    .selectOption(i === 0 ? 'breakdown' : 'combined');
  await page
    .getByLabel('I reviewed the mapped fields, request scope and identifiers')
    .check();
  if (i === 0) await page.getByRole('button', { name: 'Hide details' }).click();
}
await page.getByRole('button', { name: 'Start selected', exact: true }).click();
await page.getByRole('button', { name: 'Confirm Start', exact: true }).click();
await page
  .getByText(
    'Synthetic calls started in the local runtime. You may minimize this page.',
    { exact: true },
  )
  .waitFor();
const background = await context.newPage();
await background.goto('about:blank');
await new Promise((resolve) => setTimeout(resolve, 14000));
await page.bringToFront();
await page.getByText('Partial', { exact: true }).waitFor();
await page.screenshot({
  path: 'outputs/insurance-synthetic-results.png',
  fullPage: true,
});
await page.getByRole('button', { name: 'Print all', exact: true }).click();
await page
  .getByRole('button', { name: 'Print 2 reports', exact: true })
  .waitFor();
await page.pdf({
  path: 'outputs/insurance-synthetic-reports.pdf',
  format: 'Letter',
  printBackground: true,
  margin: { top: '0.4in', bottom: '0.4in', left: '0.4in', right: '0.4in' },
});
await page.reload();
await page
  .getByRole('button', { name: 'Use synthetic test mode', exact: true })
  .waitFor();
const count = await page
  .getByText('Synthetic Patient A', { exact: true })
  .count();
if (count !== 0) throw new Error('Refresh retained synthetic task');
writeFileSync(
  'outputs/browser-validation.json',
  JSON.stringify(
    {
      errors,
      refreshEmpty: count === 0,
      syntheticCompleted: true,
      physicalMinimizeTested: false,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    errors,
    refreshEmpty: count === 0,
    syntheticCompleted: true,
  }),
);
await browser.close();
