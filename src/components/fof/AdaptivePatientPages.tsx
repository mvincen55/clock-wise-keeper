import { useLayoutEffect, useRef, type ReactNode } from 'react';

const PAGE_HEIGHT = 940; // 10 printable inches, with browser/font rounding slack.
const clone = (node: Element) => node.cloneNode(true) as HTMLElement;

/** Read-only print DOM, measured and composed entirely in browser memory.
 * React owns the source; only this component owns the presentation clones.
 * No serialization, storage, network, logging, or patient-derived attributes.
 */
export default function AdaptivePatientPages({ children }: { children: ReactNode }) {
  const source = useRef<HTMLDivElement>(null);
  const output = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const sourceRoot = source.current;
    const target = output.current;
    const original = sourceRoot?.firstElementChild as HTMLElement | null;
    if (!original || !sourceRoot || !target) return;
    let disposed = false;
    const compose = () => {
      if (disposed || !original.isConnected) return;
      const measure = document.createElement('div');
      measure.className = 'fof-page-measure';
      target.parentElement!.append(measure);
      let measured = false;
      const naturalHeight = (page: HTMLElement) => {
        measure.replaceChildren(page);
        const height = page.offsetHeight;
        if (height > 0) measured = true;
        return height;
      };
      const prepare = (page: HTMLElement, compact: boolean, columns: boolean) => {
        page.classList.remove('fof-roomy');
        if(compact) page.classList.add('fof-dense','fof-denser');
        page.classList.add('fof-composed-page');
        page.classList.toggle('fof-composed-compact', compact);
        page.classList.toggle('fof-payment-columns', columns);
        return page;
      };
      const phases = [...original.querySelectorAll('.fof-payment-phase')];
      const variants = [{compact:false,columns:false},{compact:true,columns:false},
        ...(phases.length >= 5 ? [{compact:false,columns:true},{compact:true,columns:true}] : [])];
      let pages: HTMLElement[] | null = null;
      try {
        for (const {compact,columns} of variants) {
          const page = prepare(clone(original), compact, columns);
          const height = naturalHeight(page);
          if (height > 0 && height <= PAGE_HEIGHT) { pages = [page]; break; }
        }
        if (!pages && phases.length > 0) {
          // Split only at whole treatment groups. Keep total, terms and signatures
          // together on the final page; repeat the office/patient header and footer.
          for (const {compact,columns} of variants) {
            let best: {pages:HTMLElement[];difference:number} | null = null;
            for (let split = 1; split < phases.length; split++) {
              const pair = [prepare(clone(original),compact,columns),prepare(clone(original),compact,columns)];
              pair.forEach((page,index) => {
                const options = page.querySelector('.fof-payment-options')!;
                const schedule = options.querySelector('.fof-phase-schedule')!;
                [...schedule.querySelectorAll('.fof-payment-phase')].forEach((phase,i) => {
                  if (index === 0 ? i >= split : i < split) phase.remove();
                });
                const children = [...page.children];
                const optionIndex = children.indexOf(options);
                for (const [i,child] of children.entries()) {
                  if (child.matches('.fof-head,.fof-footer')) continue;
                  if (index === 0 ? i > optionIndex : i < optionIndex) child.remove();
                }
                if (index === 0) {
                  schedule.querySelector('.fof-payment-plan-total')?.remove();
                  const continued=document.createElement('p');
                  continued.className='fof-page-continuation';
                  continued.textContent='Payment schedule continues on page 2. Review both pages before signing.';
                  options.append(continued);
                } else {
                  [...options.children].filter(child=>child!==schedule).forEach(child=>child.remove());
                  const title=schedule.querySelector('.fof-payment-kicker');
                  if(title) title.textContent='Payment schedule — continued';
                }
                const number=document.createElement('span');
                number.className='fof-page-number';number.textContent=`Page ${index+1} of 2`;
                page.querySelector('.fof-footer')?.append(number);
              });
              const heights=pair.map(naturalHeight);
              if(heights.every(h=>h>0&&h<=PAGE_HEIGHT)) {
                const difference=Math.abs(heights[0]-heights[1]);
                if(!best || difference<best.difference)best={pages:pair,difference};
              }
            }
            if(best){pages=best.pages;break;}
          }
        }
        if (pages) {
          target.replaceChildren(...pages);
          sourceRoot.dataset.composed = 'true';
          sourceRoot.setAttribute('aria-hidden','true');
        } else if (measured) {
          // Never clip, omit charges, or shrink type indefinitely to force a fit.
          const notice=document.createElement('div');notice.className='fof-layout-review';notice.setAttribute('role','alert');
          notice.textContent='This form needs a shorter treatment summary or fewer separate treatment groups to print clearly within two patient pages. Review the plan before printing.';
          target.replaceChildren(notice);sourceRoot.dataset.composed='true';
          sourceRoot.setAttribute('aria-hidden','true');
        } else {
          // A hidden print portal cannot be measured until beforeprint. Drop any
          // previous form now, then compose the current source when it is visible.
          target.replaceChildren();
          delete sourceRoot.dataset.composed;
          sourceRoot.removeAttribute('aria-hidden');
        }
      } finally { measure.remove(); }
    };
    compose();
    if(document.fonts?.status === 'loading') void document.fonts.ready.then(()=>{if(!disposed)compose();});
    const images=[...original.querySelectorAll('img')];
    images.forEach(img=>img.addEventListener('load',compose));
    // Nested components may update without replacing the parent's children prop.
    // Keep the preview synchronized with those edits as well as the print event.
    const observer = new MutationObserver(compose);
    observer.observe(original, { subtree: true, childList: true, characterData: true, attributes: true });
    window.addEventListener('beforeprint',compose);
    return () => { disposed=true;observer.disconnect();images.forEach(img=>img.removeEventListener('load',compose));window.removeEventListener('beforeprint',compose); };
  }, [children]);
  return <div className="fof-adaptive-patient"><div ref={source} className="fof-page-source">{children}</div><div ref={output} className="fof-composed-output" /></div>;
}
