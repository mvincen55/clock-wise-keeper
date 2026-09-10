import type { CurrentFofContext } from '@/lib/fof/current-form-assistant';
import { computeFof } from '@/lib/fof/compute';
import { LIVE_TEMPLATES } from './blank-form-fixtures';
export function currentFormFixture(): CurrentFofContext {
  const amounts = { totalCents: 120000, insuranceEstimateCents: 30000, writeOffCents: 10000 };
  return { amounts, computation: computeFof({...LIVE_TEMPLATES[0], showInsuranceEstimate: true, showWriteOff: true}, amounts, {}),
    treatment: 'private form context', policy: null, issues: [],
    lines: [{ code: 'D6058', tooth: '8', description: 'Implant crown', feeCents: 120000, insuranceCents: 30000, writeOffCents: 10000 }],
    insurance: { enabled: true, scheduleId: 'carrier-a', scheduleName: 'Carrier A', deductibleCents: 5000, annualMaximumCents: 100000, settings: 'One benefit year.', manuallyOverridden: false },
  };
}
