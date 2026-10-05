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
  // realFlow: print the way the office does — with the page still styled for
  // the screen, so Chromium's beforeprint reaches the hidden portal exactly as
  // it does from the Print button or Ctrl+P. Otherwise print media is emulated
  // first, which lets layout be measured on the live page.
  async function pdfTexts(file,scale=1,realFlow=false) {
    const viewport=page.viewportSize();
    await page.setViewportSize({width:Math.round(720/scale),height:Math.round(960/scale)});
    // An emulated media type also governs printing, so the real flow clears it.
    await page.emulateMedia({media:realFlow?null:'print'});
    const bytes=await page.pdf({path:path.join(output,file),format:'Letter',scale,printBackground:true,preferCSSPageSize:true});
    const loadingTask=getDocument({data:new Uint8Array(bytes),disableFontFace:true,verbosity:0});
    const doc=await loadingTask.promise;
    const texts=[];
    for(let i=1;i<=doc.numPages;i++) texts.push((await (await doc.getPage(i)).getTextContent()).items.map(item=>item.str).join(' '));
    if(!realFlow && texts.length>1 && file.startsWith('patient')) {
      console.log('Layout metrics',JSON.stringify(await page.evaluate(()=>{
        const original=document.querySelector('.fof-page-source')?.firstElementChild;
        if(!original)return {};
        const measure=document.createElement('div');measure.className='fof-page-measure';document.querySelector('.fof-print-root').append(measure);
        const variants=[false,true].map(compact=>{
          const node=original.cloneNode(true);node.classList.remove('fof-roomy');node.classList.add('fof-composed-page');
          if(compact)node.classList.add('fof-dense','fof-denser','fof-composed-compact');
          measure.replaceChildren(node);
          return {compact,width:node.offsetWidth,height:node.offsetHeight,minHeight:getComputedStyle(node).minHeight,children:[...node.children].map(child=>({class:child.className,height:child.getBoundingClientRect().height,margin:getComputedStyle(child).margin}))};
        });
        measure.remove();return {viewport:[innerWidth,innerHeight],composed:document.querySelectorAll('.fof-composed-output .fof-composed-page').length,variants};
      })));
    }
    await loadingTask.destroy();
    await page.emulateMedia({media:'screen'});
    await page.setViewportSize(viewport);
    return texts;
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
    // The real print flow must produce the same pages: no blank sheet between the
    // patient page and the office copy, and no plain source sheet printed in place
    // of the composed one.
    const real=await pdfTexts(`${mode}-real-flow.pdf`,1,true);
    assert.equal(real.length,texts.length,`${mode} real-flow page count`);
    assert.deepEqual(real.map(t=>/PATIENT SIGNATURE/i.test(t)),texts.map(t=>/PATIENT SIGNATURE/i.test(t)),`${mode} real-flow signature pages`);
    if(mode==='both') assert.match(real[1],/Office Copy/,'The office copy follows the patient page directly');
    if(mode==='patient') {
      await page.getByRole('button',{name:'Increase crown fee'}).click();
      await page.getByRole('button',{name:'Prepare print'}).click();
      const updated=await pdfTexts('patient-repriced.pdf');
      assert.equal(updated.length,1);assert.match(updated[0],/8,273.00/);assert.doesNotMatch(updated[0],/8,173.00/);
      // A zoomed tab prints the same single page: the sheet undoes Chrome's print
      // zoom on paper, so the fit measured on screen is the fit printed.
      for(const scale of [0.67,1.25]) {
        const zoomed=await pdfTexts(`patient-zoom-${scale}.pdf`,scale,true);
        console.log(`Patient at ${scale*100}%: ${zoomed.length} pages`);
        assert.equal(zoomed.length,1,'Print zoom must not change the page count');
        assert.match(zoomed[0],/PATIENT SIGNATURE/i);assert.match(zoomed[0],/8,273.00/);
        assert.match(zoomed[0],/Implant Crown/,'Signatures must accompany treatment payments');
      }
    }
  }
  // Neither agreement offered (both toggled off by staff): still one patient page
  // and the office copy right behind it, through the real print flow.
  await page.emulateMedia({media:'screen'});
  await page.goto(`${origin}/.repro/fof-browser/index.html?mode=both&options=off`);
  await page.getByRole('heading',{name:'Patient payment schedule'}).waitFor();
  await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
  await page.getByRole('button',{name:'Prepare print'}).click();
  assert.equal(await page.locator('#print-result').textContent(),'Ready');
  assert.equal(await page.locator('.fof-payment-options').count(),0,'No agreement offered prints no payment section');
  const noOptions=await pdfTexts('both-no-options-real-flow.pdf',1,true);
  console.log(`both (no agreements): ${noOptions.length} PDF pages`);
  assert.equal(noOptions.length,2,'no-agreement page count');
  assert.match(noOptions[0],/PATIENT SIGNATURE/i);assert.match(noOptions[1],/Office Copy/);
  await page.goto(`${origin}/.repro/fof-browser/index.html?view=import`);
  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('alertdialog').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished)));
  for(const width of [1280,850,390]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const bounds=await page.getByRole('alertdialog').boundingBox();
    console.log('Review viewport',width,JSON.stringify(await page.getByRole('alertdialog').evaluate(element=>({width:getComputedStyle(element).width,minWidth:getComputedStyle(element).minWidth,inline:element.getAttribute('style'),viewport:innerWidth,client:document.documentElement.clientWidth}))));
    await page.screenshot({path:path.join(output,`import-review-${width}.png`),fullPage:true});
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1,`Review dialog outside viewport ${width}: ${JSON.stringify(bounds)}`);
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
