import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  requestKinds,
  requestLabels,
  questionLabels,
  genericKeys,
  memberKeys,
  sessionKeys,
  officeBreakdownQuestions,
  scopeLabels,
  settingsSchema,
  type OfficeSettings,
  type Question,
} from '../domain/schema';
import { saveSettings, type ReferenceData } from '../adapters/references';
import { Check, Field, SelectField } from './fields';

export function QuestionEditor({
  questions,
  onChange,
  kind,
}: {
  questions: Question[];
  onChange: (q: Question[]) => void;
  kind: string;
}) {
  const keys =
    kind === 'breakdown'
      ? [...genericKeys, ...sessionKeys]
      : kind === 'eligibility'
        ? memberKeys
        : [...genericKeys, ...memberKeys, ...sessionKeys];
  return (
    <div className="space-y-2">
      {questions.map((q, i) => (
        <div
          key={i}
          className="grid gap-2 rounded border p-2 sm:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <SelectField
            label="Question"
            value={q.key}
            onChange={(key) =>
              onChange(
                questions.map((v, n) =>
                  n === i ? { ...v, key: key as Question['key'] } : v,
                ),
              )
            }
          >
            {keys.map((key) => (
              <option key={key} value={key}>
                {questionLabels[key]}
              </option>
            ))}
          </SelectField>
          <Field
            label="Scope (plan, procedure or CDT)"
            value={q.scope}
            onChange={(scope) =>
              onChange(questions.map((v, n) => (n === i ? { ...v, scope } : v)))
            }
          />
          <Check
            label="Required"
            checked={q.required}
            onChange={(required) =>
              onChange(
                questions.map((v, n) => (n === i ? { ...v, required } : v)),
              )
            }
          />
          <Button
            variant="ghost"
            onClick={() => onChange(questions.filter((_, n) => n !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          onChange([
            ...questions,
            {
              key: kind === 'eligibility' ? 'eligible' : 'coverage',
              scope: kind === 'eligibility' ? 'plan' : 'preventive',
              required: true,
            },
          ])
        }
      >
        Add question
      </Button>
    </div>
  );
}
export function SettingsPanel({
  data,
  orgId,
  manager,
  onSaved,
}: {
  data: ReferenceData;
  orgId: string;
  manager: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<OfficeSettings>(() =>
    structuredClone(data.settings),
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof OfficeSettings>(
    key: K,
    value: OfficeSettings[K],
  ) => setDraft((s) => ({ ...s, [key]: value }));
  if (!manager)
    return (
      <p>Only an office owner or manager can change insurance settings.</p>
    );
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Insurance settings</h2>
        <p className="text-sm text-muted-foreground">
          Office configuration only. Patient values never belong in presets.
        </p>
      </div>
      <Check
        label="Enable insurance operations for this office"
        checked={draft.enabled}
        onChange={(v) => set('enabled', v)}
      />
      <p className="text-sm">
        Disabling stops new launches. The runtime expires active sessions and
        requests cancellation; reference data remains available.
      </p>
      <div className="rounded border bg-muted/30 p-4">
        <strong>Calling setup required</strong>
        <p className="text-sm">
          No live calling environment is configured by this build. A covered,
          long-lived relay, approved caller/model/telephony services, confirmed
          destinations, retention settings and tested payer workflow are
          required.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Default request"
          value={draft.defaultKind}
          onChange={(v) =>
            set('defaultKind', v as OfficeSettings['defaultKind'])
          }
        >
          {requestKinds.map((k) => (
            <option value={k} key={k}>
              {requestLabels[k]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Default delivery"
          value={draft.defaultDelivery}
          onChange={(v) =>
            set('defaultDelivery', v as OfficeSettings['defaultDelivery'])
          }
        >
          <option value="answers">Collect answers</option>
          <option value="fax">Request a fax</option>
          <option value="answers_and_fax">Answers and fax request</option>
        </SelectField>
        <Field
          label="Review freshness (days)"
          type="number"
          value={draft.freshnessDays}
          onChange={(v) => set('freshnessDays', Number(v))}
        />
      </div>
      {requestKinds.map((kind) => (
        <section key={kind} className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">{requestLabels[kind]}</h3>
          {kind !== 'eligibility' && (
            <div className="space-y-2 rounded border p-3">
              <h4 className="font-medium">What should the AI obtain?</h4>
              <p className="text-sm">
                Choose the questions to ask. Frequencies and age restrictions
                stay separate for BWX, FMX, Prophy, Perio, Exams, Fluoride and
                Sealants. Add exact CDT scopes when the payer distinguishes
                procedures. Unusual notes remain in this session only.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {officeBreakdownQuestions.map((q) => {
                  const selected = draft.presets[kind].questions.some(
                    (x) => x.key === q.key && x.scope === q.scope,
                  );
                  return (
                    <Check
                      key={`${q.key}:${q.scope}`}
                      label={`${questionLabels[q.key]}${q.scope === 'plan' ? '' : ` — ${scopeLabels[q.scope]}`}`}
                      checked={selected}
                      onChange={(checked) =>
                        set('presets', {
                          ...draft.presets,
                          [kind]: {
                            ...draft.presets[kind],
                            questions: checked
                              ? [...draft.presets[kind].questions, q]
                              : draft.presets[kind].questions.filter(
                                  (x) => x.key !== q.key || x.scope !== q.scope,
                                ),
                          },
                        })
                      }
                    />
                  );
                })}
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  set('presets', {
                    ...draft.presets,
                    [kind]: {
                      ...draft.presets[kind],
                      questions: [
                        ...draft.presets[kind].questions.filter(
                          (q) =>
                            !officeBreakdownQuestions.some(
                              (x) => x.key === q.key && x.scope === q.scope,
                            ),
                        ),
                        ...officeBreakdownQuestions,
                      ],
                    },
                  })
                }
              >
                Select full office breakdown checklist
              </Button>
            </div>
          )}
          <QuestionEditor
            kind={kind}
            questions={draft.presets[kind].questions as Question[]}
            onChange={(questions) =>
              set('presets', {
                ...draft.presets,
                [kind]: { ...draft.presets[kind], questions },
              })
            }
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {(['holdSeconds', 'totalSeconds', 'retries'] as const).map(
              (key) => (
                <Field
                  key={key}
                  label={
                    {
                      holdSeconds: 'Hold limit (seconds)',
                      totalSeconds: 'Total limit (seconds)',
                      retries: 'Retry limit',
                    }[key]
                  }
                  type="number"
                  value={draft.presets[kind].limits[key]}
                  onChange={(v) =>
                    set('presets', {
                      ...draft.presets,
                      [kind]: {
                        ...draft.presets[kind],
                        limits: {
                          ...draft.presets[kind].limits,
                          [key]: Number(v),
                        },
                      },
                    })
                  }
                />
              ),
            )}
          </div>
        </section>
      ))}
      <section className="space-y-3 rounded border p-4">
        <h3 className="font-semibold">Office billing rules</h3>
        <p className="text-sm">
          Office instruction: use office fee for Altus and DD RI downgrades, and
          when the patient is at maximum. Map those carriers below. These are
          office instructions, not answers the AI should claim the payer
          verified.
        </p>
        {(draft.billingPolicies ?? []).map((policy, i) => (
          <div className="grid gap-3 sm:grid-cols-4" key={i}>
            <SelectField
              label="Billing-rule carrier"
              value={policy.payerId}
              onChange={(payerId) =>
                set(
                  'billingPolicies',
                  draft.billingPolicies.map((p, n) =>
                    n === i ? { ...p, payerId } : p,
                  ),
                )
              }
            >
              <option value="">Choose carrier</option>
              {data.directory.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.label}
                </option>
              ))}
            </SelectField>
            {(['downgradeFee', 'maximumFee'] as const).map((key) => (
              <SelectField
                key={key}
                label={
                  key === 'downgradeFee'
                    ? 'Fee for downgrades'
                    : 'Fee when at maximum'
                }
                value={policy[key] ?? ''}
                onChange={(value) =>
                  set(
                    'billingPolicies',
                    draft.billingPolicies.map((p, n) =>
                      n === i ? { ...p, [key]: value || null } : p,
                    ),
                  )
                }
              >
                <option value="">No office instruction</option>
                <option value="office_fee">Office fee</option>
                <option value="insurance_fee">Insurance fee</option>
              </SelectField>
            ))}
            <Button
              variant="ghost"
              onClick={() =>
                set(
                  'billingPolicies',
                  draft.billingPolicies.filter((_, n) => n !== i),
                )
              }
            >
              Remove billing rule
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            set('billingPolicies', [
              ...(draft.billingPolicies ?? []),
              {
                payerId: '',
                downgradeFee: 'office_fee',
                maximumFee: 'office_fee',
              },
            ])
          }
        >
          Add carrier office-fee rule
        </Button>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Carrier-specific presets</h3>
        {draft.carrierOverrides.map((override, i) => (
          <div className="space-y-3 rounded border p-3" key={i}>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Carrier"
                value={override.payerId}
                onChange={(payerId) =>
                  set(
                    'carrierOverrides',
                    draft.carrierOverrides.map((v, n) =>
                      n === i ? { ...v, payerId } : v,
                    ),
                  )
                }
              >
                <option value="">Choose carrier</option>
                {data.directory.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label="Request type"
                value={override.kind}
                onChange={(kind) =>
                  set(
                    'carrierOverrides',
                    draft.carrierOverrides.map((v, n) =>
                      n === i
                        ? {
                            ...v,
                            kind: kind as typeof override.kind,
                            preset: structuredClone(draft.presets[kind]),
                          }
                        : v,
                    ),
                  )
                }
              >
                {requestKinds.map((k) => (
                  <option key={k} value={k}>
                    {requestLabels[k]}
                  </option>
                ))}
              </SelectField>
            </div>
            <QuestionEditor
              kind={override.kind}
              questions={override.preset.questions as Question[]}
              onChange={(questions) =>
                set(
                  'carrierOverrides',
                  draft.carrierOverrides.map((v, n) =>
                    n === i ? { ...v, preset: { ...v.preset, questions } } : v,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              onClick={() =>
                set(
                  'carrierOverrides',
                  draft.carrierOverrides.filter((_, n) => n !== i),
                )
              }
            >
              Remove carrier variation
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            set('carrierOverrides', [
              ...draft.carrierOverrides,
              {
                payerId: '',
                kind: 'breakdown',
                preset: structuredClone(draft.presets.breakdown),
              },
            ])
          }
        >
          Add carrier variation
        </Button>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">CDT bundles</h3>
        {draft.bundles.map((bundle, i) => (
          <div className="grid gap-3 sm:grid-cols-2" key={i}>
            <Field
              label="Bundle name"
              value={bundle.name}
              onChange={(name) =>
                set(
                  'bundles',
                  draft.bundles.map((b, n) => (n === i ? { ...b, name } : b)),
                )
              }
            />
            <Field
              label="Codes, separated by commas"
              value={bundle.codes.join(',')}
              onChange={(v) =>
                set(
                  'bundles',
                  draft.bundles.map((b, n) =>
                    n === i
                      ? {
                          ...b,
                          codes: v
                            .split(',')
                            .map((c) => c.trim().toUpperCase()),
                        }
                      : b,
                  ),
                )
              }
            />
          </div>
        ))}
        <Button
          variant="outline"
          onClick={() =>
            set('bundles', [
              ...draft.bundles,
              { name: 'New bundle', codes: ['D0120'] },
            ])
          }
        >
          Add bundle
        </Button>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Confirmed directory mappings</h3>
        <p className="text-sm">
          Choose entries by inspecting their values. Saving confirms the
          selected role. Missing entry?{' '}
          <Link className="underline" to="/important-numbers">
            Edit Important Numbers
          </Link>
          .{' '}
          <Link className="underline" to="/settings/workflows">
            Edit providers
          </Link>
          .
        </p>
        {(['billing_npi', 'tax_id', 'office_fax'] as const).map((role) => (
          <SelectField
            key={role}
            label={role.replace(/_/g, ' ')}
            value={draft.mappings.find((m) => m.role === role)?.entryId ?? ''}
            onChange={(entryId) =>
              set('mappings', [
                ...draft.mappings.filter((m) => m.role !== role),
                ...(entryId
                  ? [
                      {
                        role,
                        entryId,
                        providerId: null,
                        confirmed: true as const,
                      },
                    ]
                  : []),
              ])
            }
          >
            <option value="">Not mapped</option>
            {data.directory.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} — {e.value}
              </option>
            ))}
          </SelectField>
        ))}
        {draft.mappings.map(
          (mapping, i) =>
            ['rendering_npi', 'payer_phone'].includes(mapping.role) && (
              <div key={i} className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  label={
                    mapping.role === 'payer_phone'
                      ? 'Payer telephone entry'
                      : 'Rendering NPI entry'
                  }
                  value={mapping.entryId}
                  onChange={(entryId) =>
                    set(
                      'mappings',
                      draft.mappings.map((m, n) =>
                        n === i ? { ...m, entryId } : m,
                      ),
                    )
                  }
                >
                  <option value="">Choose canonical entry</option>
                  {data.directory.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label} — {e.value}
                    </option>
                  ))}
                </SelectField>
                {mapping.role === 'rendering_npi' && (
                  <SelectField
                    label="Rendering provider"
                    value={mapping.providerId ?? ''}
                    onChange={(providerId) =>
                      set(
                        'mappings',
                        draft.mappings.map((m, n) =>
                          n === i
                            ? { ...m, providerId: providerId || null }
                            : m,
                        ),
                      )
                    }
                  >
                    <option value="">Choose provider</option>
                    {data.providers
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name}
                        </option>
                      ))}
                  </SelectField>
                )}
                <Button
                  variant="ghost"
                  onClick={() =>
                    set(
                      'mappings',
                      draft.mappings.filter((_, n) => n !== i),
                    )
                  }
                >
                  Remove mapping
                </Button>
              </div>
            ),
        )}
        <div className="flex gap-2">
          {(['payer_phone', 'rendering_npi'] as const).map((role) => (
            <Button
              key={role}
              variant="outline"
              onClick={() =>
                set('mappings', [
                  ...draft.mappings,
                  { role, entryId: '', providerId: null, confirmed: true },
                ])
              }
            >
              {role === 'payer_phone'
                ? 'Add payer telephone'
                : 'Add rendering provider NPI'}
            </Button>
          ))}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Office concurrent calls"
          type="number"
          value={draft.concurrency}
          onChange={(v) => set('concurrency', Number(v))}
        />
        <Field
          label="Session spending cap (cents)"
          type="number"
          value={draft.spendingLimitCents}
          onChange={(v) => set('spendingLimitCents', Number(v))}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Conservative defaults are shown. The relay reserves a worst-case call
        cost before launch and must be configured for the actual contracted
        rate.
      </p>
      <div className="flex flex-wrap gap-4">
        {(['owner', 'manager', 'employee'] as const).map((role) => (
          <Check
            key={role}
            label={`Authorize ${role}`}
            checked={draft.roles.includes(role)}
            onChange={(v) =>
              set(
                'roles',
                v
                  ? [...draft.roles, role]
                  : draft.roles.filter((r) => r !== role),
              )
            }
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {(['completion', 'attention', 'sound'] as const).map((key) => (
          <Check
            key={key}
            label={key === 'sound' ? 'Optional alert sound' : `${key} alerts`}
            checked={draft.alerts[key]}
            onChange={(v) => set('alerts', { ...draft.alerts, [key]: v })}
          />
        ))}
      </div>
      <Button
        disabled={busy}
        onClick={async () => {
          const parsed = settingsSchema.safeParse(draft);
          if (!parsed.success) {
            setMessage('Check question scopes, limits and bundle codes.');
            return;
          }
          setBusy(true);
          try {
            await saveSettings(orgId, data.settingsVersion, parsed.data);
            setMessage(
              'Settings saved. Running tasks keep their original preset version.',
            );
            onSaved();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save office settings
      </Button>
      <p role="status">{message}</p>
    </div>
  );
}
