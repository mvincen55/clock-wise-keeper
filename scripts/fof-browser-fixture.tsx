/** Synthetic-only browser fixture. Never imported by the application. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import FofPrintSheet, { type FofPrintMode } from '@/components/fof/FofPrintSheet';
import { PaymentScheduleEditor, usePaymentScheduleEditor, type ScheduleSourceLine } from '@/components/fof/PaymentScheduleEditor';
import TreatmentImportReview from '@/components/fof/TreatmentImportReview';
import { parseTreatmentWords } from '@/lib/fof/local-treatment-import';
import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
import { computeFof } from '@/lib/fof/compute';
import { fofPrintRootProps, prepareFofPrint } from '@/lib/fof/print';
import { LIVE_TEMPLATES, PRACTICE_DEFAULT_BRANDING } from '@/test/blank-form-fixtures';
import words from '@/test/fixtures/implant-plan-ocr-words.json';
import '@/index.css';

const codes=['D0367','D0470','D6190','D6010','D6011','7000','D6057','D6058','6059D'];
const names=['CT Scan','Diagnostic Models','Surgical Implant Guide','Dental Implant','Implant Uncovering','Post-op Visit','Implant Abutment','Implant Crown','Implant Crown Delivery'];
const fees=[52000,25600,112000,271700,49200,0,114100,192700,0];
const visits=['2','2','2','3','3','4','5','5','6'];
const classes=['workup','workup','workup','implant','implant','other','restoration','restoration','restoration'] as const;
const params=new URLSearchParams(location.search);
// ?options=off prints the form with neither agreement offered (staff toggled both off).
const template={...LIVE_TEMPLATES[0],discountPercent:5,...(params.get('options')==='off'?{showPrepayOption:false,showInstallmentOption:false}:{})};
const policy=harelickPolicyTemplate();
const practice={...PRACTICE_DEFAULT_BRANDING,logoUrl:`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="85" viewBox="0 0 300 85"><text x="4" y="50" font-family="Arial" font-size="30" fill="#53406e">Synthetic Dental</text></svg>')}`};
const result=parseTreatmentWords(words.map(w=>({...w,text:({266:'Visit 4',361:'Visit 5',469:'Visit 6'} as Record<number,string>)[w.bbox.y0]??w.text})),Object.fromEntries(codes.map((c,i)=>[c,names[i]])),Object.fromEntries(codes.map((c,i)=>[c,fees[i]/100])));

function Fixture() {
  const [extra,setExtra]=useState(0);
  const [review,setReview]=useState(params.get('view')==='import');
  const source:ScheduleSourceLine[]=codes.map((code,i)=>({id:code,code,procedureLabel:names[i],visit:visits[i],tooth:i>=3&&i!==5?'14':'',classification:classes[i],responsibilityCents:fees[i]+(i===7?extra:0)}));
  const total=817300+extra;
  const editor=usePaymentScheduleEditor('synthetic-office',policy,source,total);
  const amounts={totalCents:total,insuranceEstimateCents:0,writeOffCents:0};
  const computation=computeFof(template,amounts,{},undefined,editor.model!.schedule);
  const mode=(params.get('mode')||'both') as FofPrintMode;
  return <>
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <PaymentScheduleEditor editor={editor}/>
      <button onClick={()=>setExtra(value=>value+10000)}>Increase crown fee</button>
      <button onClick={()=>{const issue=prepareFofPrint(document.querySelector('.fof-print-root'));document.querySelector('#print-result')!.textContent=issue||'Ready';}}>Prepare print</button>
      <output id="print-result"/>
    </main>
    <TreatmentImportReview open={review} result={result} source="screenshot" officeFeeFor={code=>fees[codes.indexOf(code)]??null} onCancel={()=>setReview(false)} onImport={()=>setReview(false)}/>
    {createPortal(<div {...fofPrintRootProps()}><FofPrintSheet practice={practice} template={template} amounts={amounts} computation={computation} printMode={mode}
      patient={{patientName:'Synthetic Patient',dateISO:'2026-09-30',treatment:'Dr. Scott will take impressions and X-rays to plan for an implant on tooth #14. Later, she will place the implant on tooth #14 and uncover it at the same visit. At a later visit, Dr. Scott will deliver an implant connector and a crown on tooth #14 to help rebuild a strong, functional bite.'}}
      officeLines={source.map(line=>({code:line.code,tooth:line.tooth||'',visit:line.visit,category:line.classification||'',description:line.procedureLabel||'',entryDate:'8/12/2025',officeFeeCents:line.responsibilityCents,allowableCents:null,insPaysCents:0,writeOffCents:0}))}/></div>,document.body)}
  </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
