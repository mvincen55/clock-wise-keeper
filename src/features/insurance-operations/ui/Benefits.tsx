import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  requestKinds,
  requestLabels,
  presetFor,
  questionId,
  questionLabels,
  displayValue,
  type RequestKind,
  type DeliveryGoal,
  type OfficeSettings,
} from '../domain/schema';
import {
  informationIssues,
  missingQuestions,
  needsCall,
  taskLabel,
  type Task,
  type Match,
  makeTask,
} from '../domain/workflow';
import {
  importFields,
  mapRow,
  readLocalFile,
  readTable,
  type LocalTable,
  type ImportField,
} from '../adapters/import';
import type { ReferenceData } from '../adapters/references';
import { Check, Field, SelectField } from './fields';
import { QuestionEditor } from './SettingsPanel';

export function Benefits({
  tasks,
  settings,
  data,
  sessionId,
  synthetic,
  update,
  add,
  start,
  cancel,
  retry,
  print,
  matches,
  onExtract,
}: {
  tasks: Task[];
  settings: OfficeSettings;
  data: ReferenceData;
  sessionId: string;
  synthetic: boolean;
  update: (task: Task) => void;
  add: (tasks: Task[]) => void;
  start: (ids: string[]) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  print: (ids: string[]) => void;
  matches: Map<string, Match>;
  onExtract: (task: Task) => void;
}) {
  const [kind, setKind] = useState<RequestKind>(settings.defaultKind);
  const [payer, setPayer] = useState('');
  const [text, setText] = useState('');
  const [table, setTable] = useState<LocalTable>();
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>(
    {},
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string>();
  const epoch = useRef(0);
  const prepare = (value: LocalTable) => {
    setTable(value);
    const m: Partial<Record<ImportField, number>> = {};
    value.headers.forEach((h, i) => {
      const key = importFields.find(
        (k) => k.toLowerCase() === h.replace(/[ _-]/g, '').toLowerCase(),
      );
      if (key) m[key] = i;
    });
    setMapping(m);
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Today's benefits</h2>
        <span className="text-sm">
          {tasks.length} tasks · {tasks.filter((t) => needsCall(t)).length} need
          missing answers or fax requests
        </span>
      </div>
      <details className="rounded-lg border p-4" open={tasks.length === 0}>
        <summary className="cursor-pointer font-medium">
          Enter or import rows
        </summary>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Batch default request"
              value={kind}
              onChange={(v) => setKind(v as RequestKind)}
            >
              {requestKinds.map((k) => (
                <option key={k} value={k}>
                  {requestLabels[k]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Default payer (confirm after import)"
              value={payer}
              onChange={setPayer}
            >
              <option value="">Choose payer</option>
              {data.directory.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.label}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const t = makeTask(sessionId, settings, kind);
              t.planIdentity.payerId = payer;
              add([t]);
              setExpanded(t.id);
            }}
          >
            Add manual row
          </Button>
          <label className="grid gap-1 text-sm">
            Paste CSV or a tab-separated table
            <textarea
              className="min-h-24 rounded border p-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="patientName&#9;memberId&#9;groupRaw&#9;serviceDate"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                try {
                  prepare(readTable(text));
                } catch {
                  setMessage(
                    'Could not read the table. Include column headers or use manual entry.',
                  );
                }
              }}
            >
              Review pasted columns
            </Button>
            <input
              aria-label="Import local patient rows"
              type="file"
              accept=".csv,.tsv,.xlsx,.txt,.pdf,image/*"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const generation = ++epoch.current;
                setBusy(true);
                try {
                  const result = await readLocalFile(f);
                  if (generation !== epoch.current) return;
                  if ('text' in result) {
                    setText(result.text);
                    setMessage(
                      'Local text extracted. Arrange columns or enter rows manually; review against the source.',
                    );
                  } else prepare(result);
                } catch {
                  setMessage(
                    'Local parsing failed. Paste a table or use manual entry.',
                  );
                } finally {
                  if (generation === epoch.current) setBusy(false);
                }
              }}
            />
          </div>
          {table && (
            <div className="space-y-3 rounded border p-3">
              <p className="text-sm">{table.warnings.join(' ')}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {importFields.map((key) => (
                  <SelectField
                    label={key}
                    key={key}
                    value={String(mapping[key] ?? -1)}
                    onChange={(v) =>
                      setMapping((m) => ({ ...m, [key]: Number(v) }))
                    }
                  >
                    <option value="-1">Not mapped</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </SelectField>
                ))}
              </div>
              <div className="max-h-48 overflow-auto text-sm">
                {table.rows.slice(0, 10).map((r, i) => (
                  <p key={i}>{r.join(' · ')}</p>
                ))}
              </div>
              <Button
                onClick={() => {
                  const used = Object.values(mapping).filter(
                    (i) => i !== undefined && i >= 0,
                  );
                  if (new Set(used).size !== used.length) {
                    setMessage('A column is mapped more than once.');
                    return;
                  }
                  add(
                    table.rows.map((row) => {
                      const t = mapRow(
                        makeTask(sessionId, settings, kind),
                        row,
                        mapping,
                      );
                      t.planIdentity.payerId = payer;
                      return t;
                    }),
                  );
                  setTable(undefined);
                  setText('');
                }}
              >
                Add {table.rows.length} rows for review
              </Button>
            </div>
          )}
          <p role="status" className="text-sm">
            {message}
          </p>
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!tasks.some((t) => t.selected)}
          onClick={() =>
            start(tasks.filter((t) => t.selected).map((t) => t.id))
          }
        >
          Start selected
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            print(tasks.filter((t) => t.selected).map((t) => t.id))
          }
        >
          Print selected
        </Button>
        <Button variant="outline" onClick={() => print(tasks.map((t) => t.id))}>
          Print all
        </Button>
      </div>
      {tasks.map((task) => {
        const locked = task.progress !== 'draft';
        const patch = (next: Task) =>
          update({
            ...next,
            revision: task.revision + 1,
            reviewed: false,
            planSnapshot: null,
            answers: [],
          });
        const match = matches.get(task.id);
        const issues = informationIssues(task);
        return (
          <article
            key={task.id}
            className="rounded-lg border bg-card p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Check
                label={task.identity.patientName || 'Generic plan task'}
                checked={task.selected}
                onChange={(selected) => update({ ...task, selected })}
              />
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                {taskLabel(task, match)}
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  setExpanded(expanded === task.id ? undefined : task.id)
                }
              >
                {expanded === task.id ? 'Hide details' : 'Review row'}
              </Button>
            </div>
            <p className="text-sm">
              {requestLabels[task.kind]} · Group{' '}
              {task.planIdentity.groupRaw || 'missing'} ·{' '}
              {task.planIdentity.product || 'plan not specified'}
            </p>
            <p className="text-xs text-muted-foreground">
              {task.planSnapshot
                ? `Using v${task.planSnapshot.version}, reviewed ${task.planSnapshot.reviewedAt.slice(0, 10)} — ${task.planSnapshot.source}`
                : (match?.reason ?? 'No plan match yet')}
            </p>
            <p className="text-sm">
              Covered:{' '}
              {task.questions
                .filter((q) => !missingQuestions(task).includes(q))
                .map((q) => questionLabels[q.key])
                .join(', ') || 'None'}{' '}
              · Remaining:{' '}
              {missingQuestions(task)
                .map((q) => questionLabels[q.key])
                .join(', ') || 'None'}
            </p>
            {expanded === task.id && (
              <>
                <fieldset
                  disabled={locked}
                  className="space-y-3 disabled:opacity-75"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <SelectField
                      label="Request"
                      value={task.kind}
                      onChange={(v) => {
                        const nextKind = v as RequestKind;
                        const preset = presetFor(
                          settings,
                          nextKind,
                          task.planIdentity.payerId,
                        );
                        patch({
                          ...task,
                          kind: nextKind,
                          questions: preset.questions as Task['questions'],
                          limits: preset.limits,
                          presetVersion: settings.version,
                        });
                      }}
                    >
                      {requestKinds.map((k) => (
                        <option key={k} value={k}>
                          {requestLabels[k]}
                        </option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Delivery goal"
                      value={task.delivery}
                      onChange={(v) =>
                        patch({ ...task, delivery: v as DeliveryGoal })
                      }
                    >
                      <option value="answers">Collect answers</option>
                      <option value="fax">Request a fax</option>
                      <option value="answers_and_fax">
                        Collect answers and request a fax
                      </option>
                    </SelectField>
                    <SelectField
                      label="Payer"
                      value={task.planIdentity.payerId}
                      onChange={(v) =>
                        patch({
                          ...task,
                          planIdentity: { ...task.planIdentity, payerId: v },
                          questions: structuredClone(
                            presetFor(settings, task.kind, v).questions,
                          ) as Task['questions'],
                          limits: structuredClone(
                            presetFor(settings, task.kind, v).limits,
                          ),
                        })
                      }
                    >
                      <option value="">Choose payer</option>
                      {data.directory.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </SelectField>
                    {(
                      [
                        'patientName',
                        'memberId',
                        'birthDate',
                        'serviceDate',
                      ] as const
                    ).map((key) => (
                      <Field
                        key={key}
                        label={
                          {
                            patientName:
                              'Patient name (optional for generic breakdown)',
                            memberId: 'Member ID',
                            birthDate: 'Birth date YYYY-MM-DD',
                            serviceDate: 'Service date YYYY-MM-DD',
                          }[key]
                        }
                        value={task.identity[key]}
                        onChange={(v) =>
                          patch({
                            ...task,
                            identity: { ...task.identity, [key]: v },
                          })
                        }
                      />
                    ))}
                    {(
                      [
                        'groupRaw',
                        'product',
                        'subgroup',
                        'network',
                        'benefitYear',
                      ] as const
                    ).map((key) => (
                      <Field
                        key={key}
                        label={
                          {
                            groupRaw: 'Group identifier',
                            product: 'Product',
                            subgroup: 'Subgroup / confirmed N/A',
                            network: 'Network context',
                            benefitYear: 'Benefit year',
                          }[key]
                        }
                        value={task.planIdentity[key]}
                        onChange={(v) =>
                          patch({
                            ...task,
                            planIdentity: { ...task.planIdentity, [key]: v },
                          })
                        }
                      />
                    ))}
                    <SelectField
                      label="Provider"
                      value={task.planIdentity.providerId ?? ''}
                      onChange={(v) =>
                        patch({
                          ...task,
                          planIdentity: {
                            ...task.planIdentity,
                            providerId: v || null,
                          },
                        })
                      }
                    >
                      <option value="">Not provider-specific</option>
                      {data.providers
                        .filter((p) => p.active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.display_name}
                          </option>
                        ))}
                    </SelectField>
                    <Field
                      label="Requested CDT codes"
                      value={task.codes.join(',')}
                      onChange={(v) =>
                        patch({
                          ...task,
                          codes: v
                            ? v.split(',').map((c) => c.trim().toUpperCase())
                            : [],
                        })
                      }
                    />
                    <SelectField
                      label="Apply code bundle"
                      value=""
                      onChange={(v) => {
                        const bundle = settings.bundles.find(
                          (b) => b.name === v,
                        );
                        if (bundle)
                          patch({ ...task, codes: [...bundle.codes] });
                      }}
                    >
                      <option value="">Choose bundle</option>
                      {settings.bundles.map((b) => (
                        <option key={b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <QuestionEditor
                    kind={task.kind}
                    questions={task.questions}
                    onChange={(questions) => patch({ ...task, questions })}
                  />
                  <Check
                    label="Request a fresh breakdown even when reviewed rules are available"
                    checked={task.forceFresh}
                    onChange={(forceFresh) => patch({ ...task, forceFresh })}
                  />
                  <Check
                    label="I reviewed the mapped fields, request scope and identifiers"
                    checked={task.reviewed}
                    onChange={(reviewed) => update({ ...task, reviewed })}
                  />
                </fieldset>
                <div className="text-sm">
                  {issues.map((issue) => (
                    <p key={issue} className="text-destructive">
                      {issue}
                    </p>
                  ))}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Answers and current staff sources
                  </summary>
                  <div className="space-y-3 pt-3">
                    {task.questions.map((q) => {
                      const a = task.answers.find(
                        (a) => a.questionId === questionId(q),
                      );
                      return (
                        <div key={questionId(q)} className="rounded border p-3">
                          <p className="font-medium text-sm">
                            {questionLabels[q.key]} ({q.scope})
                          </p>
                          <p className="text-sm">
                            {a
                              ? `${displayValue(a.value)} · ${a.state} · ${a.source} · ${a.at}`
                              : 'Not asked'}
                          </p>
                          {!locked && (
                            <StaffAnswer
                              task={task}
                              question={q}
                              update={update}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </details>
                <p className="text-sm">
                  Limits: hold {task.limits.holdSeconds}s · total{' '}
                  {task.limits.totalSeconds}s · retries {task.limits.retries}.
                  Fax: {task.fax.replace(/_/g, ' ')}.
                </p>
                <ul className="text-xs text-muted-foreground">
                  {task.events.map((e) => (
                    <li key={e.id}>
                      {e.at} · {e.kind.replace(/_/g, ' ')} · {e.detail}
                    </li>
                  ))}
                </ul>
                {task.fax === 'requested' && (
                  <Button
                    variant="outline"
                    onClick={() => update({ ...task, fax: 'received' })}
                  >
                    I checked the office fax system: received
                  </Button>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={locked} onClick={() => start([task.id])}>
                Start one
              </Button>
              <Button variant="outline" onClick={() => print([task.id])}>
                Print one
              </Button>
              {locked && (
                <Button variant="outline" onClick={() => cancel(task.id)}>
                  Cancel
                </Button>
              )}
              {locked && needsCall(task) && (
                <Button
                  variant="outline"
                  disabled={task.attempts.length > task.limits.retries}
                  onClick={() => retry(task.id)}
                >
                  Reconcile and retry unresolved work
                </Button>
              )}
              {!synthetic &&
                task.answers.some(
                  (a) => a.source === 'representative' || a.source === 'ivr',
                ) && (
                  <Button variant="outline" onClick={() => onExtract(task)}>
                    Review generic facts for library
                  </Button>
                )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
function StaffAnswer({
  task,
  question,
  update,
}: {
  task: Task;
  question: Task['questions'][number];
  update: (t: Task) => void;
}) {
  const [value, setValue] = useState('');
  const [source, setSource] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label="Staff-entered answer" value={value} onChange={setValue} />
      <Field
        label="Current source / qualification (session only)"
        value={source}
        onChange={setSource}
      />
      <Check
        label="Source is suitable and current for this service date"
        checked={confirmed}
        onChange={setConfirmed}
      />
      <Button
        variant="outline"
        disabled={!value.trim() || !source.trim() || !confirmed}
        onClick={() =>
          update({
            ...task,
            answers: [
              ...task.answers.filter(
                (a) => a.questionId !== questionId(question),
              ),
              {
                questionId: questionId(question),
                value,
                state: 'answered',
                source: 'staff',
                at: new Date().toISOString(),
                qualification: source,
                serviceDate: task.identity.serviceDate,
                suitableCurrentSource: confirmed,
              },
            ],
          })
        }
      >
        Use current staff source
      </Button>
    </div>
  );
}
