import { describe, expect, it } from 'vitest';
import { answerCurrentForm } from '@/lib/fof/current-form-assistant';
import { currentFormFixture } from './fof-current-form-fixture';
describe('private current-form answers', () => {
  it('explains the effective amount and uses the latest form values', () => {
    const form=currentFormFixture();
    expect(answerCurrentForm('What is the patient portion?',form)).toContain('$800.00');
    form.computation.effective.patientPortionCents=70000;form.computation.overridden.patientPortion=true;
    const reply=answerCurrentForm('What is the patient portion?',form);
    expect(reply).toContain('$700.00');expect(reply).toContain('staff overrides');
  });
  it('scopes insurance notes to the selected carrier and preserves estimate limits', () => {
    const notes=[
      {code:'D6058',notes:'Office rule',scheduleId:'office',scheduleName:'Office',isUniversal:true},
      {code:'D6058',notes:'A rule',scheduleId:'carrier-a',scheduleName:'Carrier A',isUniversal:false},
      {code:'D6058',notes:'DO NOT APPLY CARRIER B',scheduleId:'carrier-b',scheduleName:'Carrier B',isUniversal:false},
    ];
    const reply=answerCurrentForm('What does insurance cover?',currentFormFixture(),notes);
    expect(reply).toContain('Office rule');expect(reply).toContain('A rule');expect(reply).not.toContain('CARRIER B');
    expect(reply).toContain('$300.00');expect(reply).toContain('not a live eligibility check');
  });
  it('does not invent insurance coverage or claim to answer unsupported questions', () => {
    const form=currentFormFixture();form.insurance.enabled=false;
    expect(answerCurrentForm('What does insurance cover?',form)).toContain('turned off');
    expect(answerCurrentForm('Tell me the weather',form)).toContain('Your question and this form stay');
    expect(answerCurrentForm('Explain my payments',null)).toContain('Open or enter');
  });
});
