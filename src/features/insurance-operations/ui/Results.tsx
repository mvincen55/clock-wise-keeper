import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { type OrgBranding } from '@/hooks/useOrgBranding';
import { completeness, missingQuestions, type Task } from '../domain/workflow';
import {
  displayValue,
  questionId,
  questionLabels,
  requestLabels,
  scopeLabels,
} from '../domain/schema';
import './print.css';

export function Report({
  task,
  branding,
  synthetic,
  payerName,
}: {
  task: Task;
  branding: OrgBranding;
  synthetic: boolean;
  payerName?: string;
}) {
  const plan = task.planSnapshot;
  return (
    <article className="io-report">
      <header className="io-report-header">
        {branding.logoUrl && <img src={branding.logoUrl} alt="" />}
        <div>
          <strong>
            {branding.legalName || branding.displayName || 'Office'}
          </strong>
          <p>
            {branding.addressLine1} {branding.addressLine2}
          </p>
          <p>{branding.phone}</p>
        </div>
      </header>
      {synthetic && (
        <p className="io-demo">SYNTHETIC TRAINING — NOT PAYER BENEFITS</p>
      )}
      <h2>{requestLabels[task.kind]}</h2>
      <p>Payer: {payerName || task.planIdentity.payerId || 'not specified'}</p>
      {task.identity.patientName && (
        <p>
          <strong>{task.identity.patientName}</strong> · Member{' '}
          {task.identity.memberId || 'not supplied'} · DOB{' '}
          {task.identity.birthDate || 'not supplied'}
        </p>
      )}
      <p>
        Task {task.id} · Service date{' '}
        {task.identity.serviceDate || 'not requested'}
      </p>
      <p>
        Group {task.planIdentity.groupRaw} · {task.planIdentity.product} ·{' '}
        {task.planIdentity.subgroup} · {task.planIdentity.network}
      </p>
      <p>CDT codes: {task.codes.join(', ') || 'None selected'}</p>
      <p>
        Updated:{' '}
        {[...task.answers.map((a) => a.at), ...(plan ? [plan.reviewedAt] : [])]
          .sort()
          .at(-1) || 'Not yet obtained'}
      </p>
      {task.billingPolicy && (
        <aside className="io-office-policy">
          <strong>Office billing instruction — not payer verification</strong>
          <p>
            Downgrades:{' '}
            {task.billingPolicy.downgradeFee?.replace(/_/g, ' ') ||
              'No instruction'}
            . At maximum:{' '}
            {task.billingPolicy.maximumFee?.replace(/_/g, ' ') ||
              'No instruction'}
            .
          </p>
        </aside>
      )}
      <p>
        Answers: {completeness(task)} · Call progress:{' '}
        {task.progress.replace(/_/g, ' ')} · Fax: {task.fax.replace(/_/g, ' ')}
      </p>
      {task.kind === 'breakdown' && (
        <p>
          <strong>
            Patient eligibility and remaining benefits were not requested.
          </strong>
        </p>
      )}
      {plan && (
        <p>
          Plan source: {plan.source} · version {plan.version} ({plan.id}) ·
          reviewed {plan.reviewedAt.slice(0, 10)} · effective{' '}
          {plan.effectiveFrom}–{plan.effectiveTo}. Cached facts are labeled
          below.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Requested question</th>
            <th>Answer</th>
            <th>Source and qualification</th>
          </tr>
        </thead>
        <tbody>
          {task.questions.map((q) => {
            const answer = task.answers.find(
              (a) => a.questionId === questionId(q),
            );
            return (
              <tr key={questionId(q)}>
                <td>
                  {q.key === 'age_limit'
                    ? 'Age limitation — procedure / restriction'
                    : questionLabels[q.key]}{' '}
                  ({scopeLabels[q.scope] ?? q.scope})
                  {q.required ? '' : ' — optional'}
                </td>
                <td>
                  {answer?.state === 'answered'
                    ? displayValue(answer.value)
                    : (answer?.state ?? 'not_asked').replace(/_/g, ' ')}
                </td>
                <td>
                  {answer
                    ? `${answer.source === 'plan_library' ? 'Reviewed plan library (cached)' : answer.source} · ${answer.at} · ${answer.qualification}`
                    : 'Unknown source'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3>Actual attempt history</h3>
      {task.attempts.length === 0 ? (
        <p>No call placed.</p>
      ) : (
        task.attempts.map((a) => (
          <p key={a.id}>
            Attempt {a.number}: {a.startedAt} —{' '}
            {a.endedAt ?? 'end not confirmed'} · reference{' '}
            {a.callRef ?? 'not obtained'} · limits: hold{' '}
            {task.limits.holdSeconds}s / total {task.limits.totalSeconds}s
          </p>
        ))
      )}
      <ul>
        {task.events.map((e) => (
          <li key={e.id}>
            {e.at} · {e.kind.replace(/_/g, ' ')}
            {e.detail ? ` · ${e.detail}` : ''}
          </li>
        ))}
      </ul>
      <p>
        Outstanding:{' '}
        {missingQuestions(task)
          .map((q) => `${questionLabels[q.key]} (${q.scope})`)
          .join('; ') || 'No unanswered questions in the requested scope.'}
      </p>
      {task.fax === 'requested' && (
        <p>
          <strong>
            Fax requested; receipt has not been confirmed. Check the existing
            office fax system.
          </strong>
        </p>
      )}
      <footer>
        Quoted information is not a guarantee of claim payment. Prepared locally
        in Purple Envelope.
      </footer>
    </article>
  );
}
export function Results({
  tasks,
  branding,
  synthetic,
  payerNames = {},
  onClose,
}: {
  tasks: Task[];
  branding: OrgBranding;
  synthetic: boolean;
  payerNames?: Record<string, string>;
  onClose: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => window.print()}>
          Print {tasks.length === 1 ? 'one' : `${tasks.length} reports`}
        </Button>
        <Button variant="outline" onClick={onClose}>
          Close preview
        </Button>
      </div>
      <p className="text-sm">
        Review before printing. Each task begins on a new page. Nothing is saved
        to cloud storage.
      </p>
      {tasks.map((t) => (
        <Report
          key={t.id}
          task={t}
          branding={branding}
          synthetic={synthetic}
          payerName={payerNames[t.planIdentity.payerId]}
        />
      ))}
      {createPortal(
        <div className="io-print-root">
          {tasks.map((t) => (
            <Report
              key={t.id}
              task={t}
              branding={branding}
              synthetic={synthetic}
              payerName={payerNames[t.planIdentity.payerId]}
            />
          ))}
        </div>,
        document.body,
      )}
    </section>
  );
}
