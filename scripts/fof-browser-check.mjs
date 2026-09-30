/** Real Chromium layout, PDF and editor regressions using synthetic data only.
 * PLAYWRIGHT_MODULE may point at a separate test install to leave the app lockfile alone. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const output=path.resolve('.repro/fof-browser');
await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/fof-browser-fixture.tsx"></script></body></html>');
const spec=process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright';
const {chromium}=await import(spec);
const server=await createServer({configFile:false,root:process.cwd(),resolve:{alias:{'@':path.resolve('src')}},esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0}});
await server.listen();
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
let browser;
try {
  browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  async function pdfTexts(file) {
    const bytes=await page.pdf({path:path.join(output,file),format:'Letter',printBackground:true,preferCSSPageSize:true});
    const doc=await getDocument({data:new Uint8Array(bytes),disableFontFace:true,verbosity:0}).promise;
    const texts=[];
    for(let i=1;i<=doc.numPages;i++) texts.push((await (await doc.getPage(i)).getTextContent()).items.map(item=>item.str).join(' '));
    await doc.destroy();return texts;
  }
  for(const mode of ['patient','office','both']) {
    await page.emulateMedia({media:'screen'});
    await page.goto(`${origin}/.repro/fof-browser/index.html?mode=${mode}`);
    await page.getByRole('heading',{name:'Patient payment schedule'}).waitFor();
    await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
    await page.getByRole('button',{name:'Prepare print'}).click();
    assert.equal(await page.locator('#print-result').textContent(),'Ready');
    const texts=await pdfTexts(`${mode}.pdf`);
    console.log(`${mode}: ${texts.length} PDF pages; signatures per page: ${texts.map(t=>/PATIENT SIGNATURE/i.test(t))}`);
    assert.equal(texts.length,mode==='both'?2:1,`${mode} page count`);
    if(mode!=='office') {
      assert.match(texts[0],/PATIENT SIGNATURE/i,'Signature must share the patient page with the schedule');
      assert.match(texts[0],/8,173.00/);
      assert.match(texts[0],/7,764.35/);
      assert.doesNotMatch(texts[0],/Office Copy/);
    }
    if(mode!=='patient') for(const code of codesForOffice()) assert.ok(texts.at(-1).includes(code),`Missing office code ${code}`);
    if(mode==='patient') {
      await page.getByRole('button',{name:'Increase crown fee'}).click();
      await page.getByRole('button',{name:'Prepare print'}).click();
      const updated=await pdfTexts('patient-repriced.pdf');
      assert.equal(updated.length,1);assert.match(updated[0],/8,273.00/);assert.doesNotMatch(updated[0],/8,173.00/);
    }
  }
  await page.goto(`${origin}/.repro/fof-browser/index.html?view=import`);
  await page.getByRole('alertdialog').waitFor();
  for(const width of [1280,850,390]) {
    await page.setViewportSize({width,height:900});
    const bounds=await page.getByRole('alertdialog').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,`Review dialog outside viewport ${width}`);
    assert.equal(await page.getByLabel('Code row 9').inputValue(),'6059D');
    assert.equal(await page.getByRole('button',{name:'Import reviewed rows'}).isEnabled(),true);
  }
  await page.setViewportSize({width:850,height:900});
  await page.screenshot({path:path.join(output,'import-review.png'),fullPage:true});
  await page.getByRole('button',{name:'Import reviewed rows'}).click();
  assert.equal(await page.locator('[data-payment-section]').count(),3);
  assert.equal(await page.locator('[data-editor-payment]').count(),6);
  const before=await page.getByLabel(/^Payment amount /).evaluateAll(inputs=>inputs.map(input=>input.value));
  await page.getByLabel(/^Payment amount /).first().focus();
  await page.getByRole('heading',{name:'Patient payment schedule'}).click();
  assert.deepEqual(await page.getByLabel(/^Payment amount /).evaluateAll(inputs=>inputs.map(input=>input.value)),before);
  await page.screenshot({path:path.join(output,'payment-editor.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('FOF browser checks passed: patient, office, combined, repricing, import at three widths, and six grouped editable payments.');
} finally {await browser?.close();await server.close();}
function codesForOffice(){return ['D0367','D0470','D6190','D6010','D6011','7000','D6057','D6058','6059D'];}
