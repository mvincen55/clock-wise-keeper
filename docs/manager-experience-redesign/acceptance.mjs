// Acceptance tests for docs/manager-experience-redesign/concepts.html (the simulation, not production).
// Run: node acceptance.mjs  (uses the globally installed Playwright and the preinstalled Chromium)
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const file = process.argv[2] || 'file:///home/user/clock-wise-keeper/docs/manager-experience-redesign/concepts.html';
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(file, { waitUntil: 'load' }); await page.waitForTimeout(400);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); };
const S = () => page.evaluate(() => { const d = window.__pe.derive(); return { needs: d.needsNow, waiting: d.waiting, deferred: d.deferred, payroll: d.payrollIssues, readiness: d.readiness, unresolved: d.unresolved }; });
const text = sel => page.$eval(sel, el => el.textContent);
const click = async sel => { await page.click(sel); await page.waitForTimeout(120); };
const scen = async k => { await click(`#scen-home [data-scen="${k}"]`); };
const badge = async () => page.evaluate(() => { const el = document.querySelector('#frame-attn .app-side .cnt'); return el ? +el.textContent : 0; });

// 1. Ask does not correct
await scen('busy'); let s0 = await S();
await click('#frame-attn [data-act="select"][data-id="mco-priya"]');
await click('#frame-attn [data-act="start"][data-id="mco-priya"][data-i="1"]');
await click('#frame-attn [data-act="confirm"]');
let s1 = await S();
check('Ask does not correct: needs-now -1', s1.needs.length === s0.needs.length - 1, `${s0.needs.length} -> ${s1.needs.length}`);
check('Ask does not correct: waiting +1', s1.waiting.includes('mco-priya'));
check('Ask does not correct: payroll issues unchanged', s1.payroll.length === s0.payroll.length && s1.payroll.includes('mco-priya'), `${s1.payroll.length}`);
check('Ask does not correct: attendance still shows no clock-out', (await text('#frame-attendance')).includes('no clock-out'));
check('Ask does not correct: payroll row says waiting', (await text('#frame-payroll')).includes('Waiting on Priya S.') && (await text('#frame-payroll')).includes('still unresolved'));

// 2. False ready impossible
await click('#frame-attn [data-act="select"][data-id="md-alice"]');
await click('#frame-attn [data-act="start"][data-id="md-alice"][data-i="1"]');
await click('#frame-attn [data-act="confirm"]');
await click('#frame-attn [data-act="select"][data-id="corr-marcus"]');
await click('#frame-attn [data-act="start"][data-id="corr-marcus"][data-i="0"]');
await click('#frame-attn [data-act="save-editor"]');
let s2 = await S();
check('False ready impossible: readiness not_ready', s2.readiness === 'not_ready', s2.readiness);
check('False ready impossible: payroll heading 2 records', (await text('#frame-payroll')).includes('2 records in Sep 7–20'));
check('False ready impossible: button says 2 unresolved', (await text('#frame-payroll .btn.p')).includes('2 unresolved'));

// 3. Snooze keeps the fact
await scen('wrap');
await click('#frame-attn [data-act="select"][data-id="w-sam"]');
await click('#frame-attn [data-act="start"][data-id="w-sam"][data-i="0"]');
await click('#frame-attn [data-act="verify-pick"][data-i="0"]');
let s3 = await S();
check('Snooze keeps the fact: Home sentence says still clocked in', (await text('#frame-home .brief')).includes('Sam K. is still clocked in') && (await text('#frame-home .brief')).includes('5:50 PM'));
check('Snooze keeps the fact: People still clocked in', (await text('#frame-people')).includes('Still clocked in'));
check('Snooze keeps the fact: item is deferred, still unresolved', s3.deferred.includes('w-sam') && s3.unresolved.includes('w-sam'));

// 4. Parked record still open
await scen('busy');
await click('#frame-attn [data-act="select"][data-id="rec-ken"]');
const b4 = await badge();
await click('#frame-attn [data-act="start"][data-id="rec-ken"][data-i="1"]');
const b4b = await badge();
await click('#frame-people [data-act="person"][data-pid="ken"]');
const ov = await text('#frame-person');
check('Parked record: overview says open + parked', ov.includes('1 open') && ov.includes('parked until tomorrow') && !ov.includes('Nothing open for Ken'));
check('Parked record: badge -1', b4b === b4 - 1, `${b4} -> ${b4b}`);
await click('#frame-person [data-act="section"][data-sec="record"]');
check('Parked record: Record section shows it open', (await text('#frame-person')).includes('parked until tomorrow'));

// 5. Inputs are real + required reasons
await scen('busy');
await click('#frame-attn [data-act="select"][data-id="mco-priya"]');
await click('#frame-attn [data-act="start"][data-id="mco-priya"][data-i="0"]');
await page.fill('#frame-attn #np-0', '4:17 PM'); await page.fill('#frame-attn #flow-reason', '');
await click('#frame-attn [data-act="save-editor"]');
check('Inputs: empty reason blocked', !!(await page.$('#frame-attn .validation')) && (await S()).unresolved.includes('mco-priya'));
await page.fill('#frame-attn #flow-reason', 'Confirmed with Priya by text.');
await click('#frame-attn [data-act="save-editor"]');
check('Inputs: submitted time recorded', (await text('#frame-attn')).includes('out 4:17 PM'));
await click('#frame-attn [data-act="select"][data-id="pto-jo"]');
await click('#frame-attn [data-act="start"][data-id="pto-jo"][data-i="1"]');
await click('#frame-attn [data-act="confirm"]');
check('Required reasons: blank decline blocked', !!(await page.$('#frame-attn .validation')) && (await S()).needs.includes('pto-jo'));
await click('#frame-attn [data-act="cancel"]');

// 6. Correct person
await click('#frame-people [data-act="ptab"][data-tab="everyone"]');
await click('#frame-people [data-act="person"][data-pid="dana"]');
check('Correct person: Dana opens', (await text('#frame-person h1')).includes('Dana R.') && (await text('#frame-person')).includes('Illustrative'));

// 7. Return to origin (Alice from Payroll)
await scen('busy');
await click('#frame-payroll [data-act="goto"][data-id="md-alice"]');
check('Return to origin: editor pill names Payroll', (await text('#frame-attn .returnpill')).includes('Payroll'));
await click('#frame-attn [data-act="choose"][data-o="Callout (unscheduled)"]');
await click('#frame-attn [data-act="save-editor"]');
check('Return to origin: Alice resolved on Payroll', (await text('#frame-payroll')).includes('Recorded · callout') && !(await S()).payroll.includes('md-alice'));

// 8. Reversal is an event
await click('#frame-attn [data-act="select"][data-id="pto-jo"]');
await click('#frame-attn [data-act="start"][data-id="pto-jo"][data-i="0"]');
await click('#frame-attn [data-act="confirm"]');
await click('#frame-attn [data-act="reverse"][data-id="pto-jo"]');
await click('#frame-attn [data-act="confirm-reverse"]');
const st = await page.evaluate(() => window.__pe.state.records['pto:jo:1'].status);
const trail = await text('#frame-attn .evlog');
check('Reversal: request cancelled, not pending', st === 'cancelled', st);
check('Reversal: trail has both events', trail.includes('Approved') && trail.includes('reversed'), trail.slice(0,80));
check('Reversal: item not back in needs-now', !(await S()).needs.includes('pto-jo'));

// 9. Stale source
await click('#frame-payroll #sim-stale');
check('Stale source: readiness unknown', (await S()).readiness === 'unknown' && (await text('#frame-payroll')).includes('Can’t confirm readiness'));
check('Stale source: Home banner', (await text('#frame-home')).includes('could not be refreshed'));
await click('#frame-payroll [data-act="retry-source"]');
check('Stale source: retry restores', (await S()).readiness !== 'unknown');

// 10. Mobile is live
await scen('busy');
const mb0 = await page.$eval('#phones .tab.on ~ .tab .cnt, #phones .cnt', el => +el.textContent).catch(() => -1);
await click('#frame-attn [data-act="select"][data-id="pto-jo"]');
await click('#frame-attn [data-act="start"][data-id="pto-jo"][data-i="0"]');
await click('#frame-attn [data-act="confirm"]');
const mb1 = await page.$eval('#phones .cnt', el => +el.textContent);
await click('#phones [data-act="m-open"][data-id="tardy-marcus"]');
await click('#phones [data-act="start"][data-id="tardy-marcus"][data-i="0"]');
await click('#phones [data-act="confirm"]');
const desk = await badge();
check('Mobile is live: phone badge follows desktop', mb1 === mb0 - 1, `${mb0} -> ${mb1}`);
check('Mobile is live: phone action drops desktop badge', desk === mb1 - 1, `${mb1} -> ${desk}`);

// 11. Marcus arithmetic
await click('#frame-attn [data-act="select"][data-id="corr-marcus"]');
check('Marcus arithmetic 9:09 → 8:24', (await text('#frame-attn .panel')).includes('9:09 → 8:24'));

// 12. Keyboard: Enter on a focused row selects it
await scen('busy');
await page.focus('#frame-attn .row[data-id="ctd-sat"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
check('Keyboard: Enter selects a row', await page.evaluate(() => window.__pe.state.selected === 'ctd-sat'));
check('Keyboard: focus moved to panel title', await page.evaluate(() => document.activeElement && document.activeElement.id === 'panel-title'));

const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
check('No horizontal overflow at 1440', overflow.sw <= overflow.cw, JSON.stringify(overflow));
check('No page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const pass = results.filter(r => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  (' + r.detail + ')' : ''}`);
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
