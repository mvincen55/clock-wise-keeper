import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PatientPaymentOptions } from '@/components/fof/PatientPaymentOptions';
import { buildPaymentSchedule } from '@/lib/fof/payment-engine';
import { fullFixture } from './fof-payment-fixture';
import { computeFof } from '@/lib/fof/compute';
import { LIVE_TEMPLATES } from './blank-form-fixtures';

describe('patient payment presentation', () => {
  it('shows each event once, with phase wording once and unchanged totals', () => {
    const input=fullFixture();
    for(const event of input.events){const group=input.groups.find(g=>Object.values(g.events).includes(event.id))!;event.label=`${group.label} — Due ${event.id}`;}
    const schedule=buildPaymentSchedule(input);
    const template={...LIVE_TEMPLATES[0],showPrepayOption:true,showInstallmentOption:true};
    const computation=computeFof(template,{totalCents:817300,insuranceEstimateCents:0,writeOffCents:0},{},undefined,schedule);
    const before=JSON.stringify(schedule);
    const {container,getByText}=render(<PatientPaymentOptions schedule={schedule} computation={computation} template={template} prepayMark="**"/>);
    expect(container.querySelectorAll('[data-payment-event]')).toHaveLength(6);
    expect([...container.querySelectorAll('[data-payment-event]')].map(e=>e.getAttribute('data-payment-event'))).toEqual(schedule.rows.map(r=>r.id));
    expect(container.querySelectorAll('.fof-payment-phase')).toHaveLength(3);
    expect(getByText('Due rb')).toBeTruthy();expect(getByText('Restoration')).toBeTruthy();
    expect(JSON.stringify(schedule)).toBe(before);
  });
  it('preserves custom payment wording', () => {
    const schedule=buildPaymentSchedule(fullFixture());schedule.rows[0].label='Your agreed payment wording';
    const template={...LIVE_TEMPLATES[0],showPrepayOption:false,showInstallmentOption:true};
    const computation=computeFof(template,{totalCents:817300,insuranceEstimateCents:0,writeOffCents:0},{},undefined,schedule);
    const {getByText}=render(<PatientPaymentOptions schedule={schedule} computation={computation} template={template} prepayMark=""/>);
    expect(getByText('Your agreed payment wording')).toBeTruthy();
  });
});
