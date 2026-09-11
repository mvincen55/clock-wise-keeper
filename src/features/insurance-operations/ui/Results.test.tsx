import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Report } from './Results';
import { syntheticTasks, syntheticPlan } from '../domain/synthetic';
import { applyPlan, finishWithoutCall } from '../domain/workflow';
import { GENERIC_BRANDING } from '@/hooks/useOrgBranding';
it('prints cached breakdown provenance without silently requiring eligibility', () => {
  const t = syntheticTasks('s')[0];
  t.reviewed = true;
  const done = finishWithoutCall(applyPlan(t, syntheticPlan()));
  const html = renderToStaticMarkup(
    <Report task={done} branding={GENERIC_BRANDING} synthetic />,
  );
  expect(html).toContain(
    'Patient eligibility and remaining benefits were not requested.',
  );
  expect(html).toContain('Reviewed plan library (cached)');
  expect(html).toContain('No call placed.');
  expect(html).toContain('SYNTHETIC TRAINING');
});
it('prints a fax promise as pending receipt and missing answers honestly', () => {
  const t = syntheticTasks('s')[1];
  t.fax = 'requested';
  t.progress = 'finished';
  const html = renderToStaticMarkup(
    <Report task={t} branding={GENERIC_BRANDING} synthetic />,
  );
  expect(html).toContain('receipt has not been confirmed');
  expect(html).toContain('Answers: none');
  expect(html).toContain('not asked');
});
