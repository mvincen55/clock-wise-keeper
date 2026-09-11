import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  genericKeys,
  questionLabels,
  displayValue,
  planDraftSchema,
  type PlanDraft,
  type PlanVersion,
  type GenericRule,
} from '../domain/schema';
import { publishPlan, type ReferenceData } from '../adapters/references';
import { readLocalFile } from '../adapters/import';
import { Check, Field, SelectField } from './fields';

export function RuleEditor({
  rule,
  onChange,
}: {
  rule: GenericRule;
  onChange: (v: GenericRule) => void;
}) {
  const value = rule.value;
  return (
    <div className="grid gap-3 rounded border p-3 sm:grid-cols-3">
      <SelectField
        label="Generic rule"
        value={rule.key}
        onChange={(key) =>
          onChange({
            ...rule,
            key: key as GenericRule['key'],
            value: null,
            status: 'unknown',
          })
        }
      >
        {genericKeys.map((k) => (
          <option key={k} value={k}>
            {questionLabels[k]}
          </option>
        ))}
      </SelectField>
      <Field
        label="Scope (plan/category/CDT)"
        value={rule.scope}
        onChange={(scope) => onChange({ ...rule, scope })}
      />
      <SelectField
        label="Status"
        value={rule.status}
        onChange={(status) =>
          onChange({ ...rule, status: status as GenericRule['status'] })
        }
      >
        {['confirmed', 'unknown', 'conflicting'].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </SelectField>
      <SelectField
        label="Value type"
        value={
          value === null
            ? 'unknown'
            : typeof value === 'boolean'
              ? 'boolean'
              : 'amount' in value
                ? 'quantity'
                : 'rule'
        }
        onChange={(type) =>
          onChange({
            ...rule,
            value:
              type === 'unknown'
                ? null
                : type === 'boolean'
                  ? false
                  : type === 'quantity'
                    ? {
                        amount: 0,
                        unit: rule.key === 'coverage' ? 'percent' : 'USD',
                        window: 'none',
                        windowMonths: null,
                      }
                    : { meaning: 'applies', codes: [] },
          })
        }
      >
        <option value="unknown">Unknown</option>
        <option value="boolean">Yes / No</option>
        <option value="quantity">Quantity with units</option>
        <option value="rule">Rule / shared codes</option>
      </SelectField>
      {typeof value === 'boolean' && (
        <SelectField
          label="Answer"
          value={String(value)}
          onChange={(v) => onChange({ ...rule, value: v === 'true' })}
        >
          <option value="true">Yes</option>
          <option value="false">No</option>
        </SelectField>
      )}
      {value && typeof value === 'object' && 'amount' in value && (
        <>
          <Field
            label="Amount"
            type="number"
            value={value.amount}
            onChange={(v) =>
              onChange({ ...rule, value: { ...value, amount: Number(v) } })
            }
          />
          <SelectField
            label="Unit"
            value={value.unit}
            onChange={(unit) =>
              onChange({
                ...rule,
                value: { ...value, unit: unit as typeof value.unit },
              })
            }
          >
            {['percent', 'USD', 'visits', 'months', 'years', 'days'].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </SelectField>
          <SelectField
            label="Time window"
            value={value.window}
            onChange={(window) =>
              onChange({
                ...rule,
                value: { ...value, window: window as typeof value.window },
              })
            }
          >
            {[
              'none',
              'calendar_year',
              'benefit_year',
              'rolling_months',
              'lifetime',
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </SelectField>
          <Field
            label="Window months (when applicable)"
            type="number"
            value={value.windowMonths ?? ''}
            onChange={(v) =>
              onChange({
                ...rule,
                value: { ...value, windowMonths: v ? Number(v) : null },
              })
            }
          />
        </>
      )}
      {value && typeof value === 'object' && 'meaning' in value && (
        <>
          <SelectField
            label="Interpretation"
            value={value.meaning}
            onChange={(meaning) =>
              onChange({
                ...rule,
                value: { ...value, meaning: meaning as typeof value.meaning },
              })
            }
          >
            {[
              'applies',
              'does_not_apply',
              'calendar_year',
              'contract_year',
              'not_covered',
              'covered',
              'alternate_benefit',
              'shared_limit',
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </SelectField>
          <Field
            label="Related CDT codes"
            value={value.codes.join(',')}
            onChange={(v) =>
              onChange({
                ...rule,
                value: {
                  ...value,
                  codes: v
                    ? v.split(',').map((c) => c.trim().toUpperCase())
                    : [],
                },
              })
            }
          />
        </>
      )}
    </div>
  );
}
const blankPlan = (): PlanDraft => ({
  payerId: '',
  groupRaw: '',
  product: '',
  subgroup: '',
  network: '',
  providerId: null,
  benefitYear: '',
  effectiveFrom: '',
  effectiveTo: '',
  source: '',
  sourceDate: '',
  confidence: 'high',
  insurancePlanId: null,
  feeScheduleId: null,
  manualId: null,
  rules: [
    { key: 'coverage', scope: 'preventive', status: 'unknown', value: null },
  ],
});
export function PlanLibrary({
  data,
  orgId,
  manager,
  onSaved,
  extraction,
}: {
  data: ReferenceData;
  orgId: string;
  manager: boolean;
  onSaved: () => void;
  extraction?: GenericRule[];
}) {
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    ...blankPlan(),
    ...(extraction ? { rules: structuredClone(extraction) } : {}),
  }));
  const [previous, setPrevious] = useState<PlanVersion>();
  const [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setReviewed(false);
  };
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Plan library</h2>
      <p className="text-sm text-muted-foreground">
        Reviewed generic rules for this office. FOF estimates are linked
        references, never verified group benefits.
      </p>
      <div className="space-y-2">
        {data.versions.map((p) => (
          <div key={p.id} className="rounded-lg border p-3">
            <div className="flex justify-between gap-3">
              <strong>
                {p.product} · {p.groupRaw} · v{p.version}
              </strong>
              <span>{p.status}</span>
            </div>
            <p className="text-sm">
              {p.network} · {p.subgroup} · {p.effectiveFrom}–{p.effectiveTo} ·
              reviewed {p.reviewedAt.slice(0, 10)}
            </p>
            <p className="text-sm">
              {p.source} · reviewer {p.reviewerId}
            </p>
            <ul className="mt-2 text-sm">
              {p.rules.map((r, i) => (
                <li key={i}>
                  {questionLabels[r.key]} ({r.scope}):{' '}
                  {r.status === 'confirmed' ? displayValue(r.value) : r.status}
                </li>
              ))}
            </ul>
            {manager && p.status === 'reviewed' && (
              <Button
                className="mt-2"
                variant="outline"
                onClick={() => {
                  const {
                    payerId,
                    groupRaw,
                    product,
                    subgroup,
                    network,
                    providerId,
                    effectiveFrom,
                    effectiveTo,
                    benefitYear,
                    insurancePlanId,
                    feeScheduleId,
                    manualId,
                    source,
                    sourceDate,
                    confidence,
                    rules,
                  } = p;
                  setDraft({
                    payerId,
                    groupRaw,
                    product,
                    subgroup,
                    network,
                    providerId,
                    effectiveFrom,
                    effectiveTo,
                    benefitYear,
                    insurancePlanId,
                    feeScheduleId,
                    manualId,
                    source,
                    sourceDate,
                    confidence,
                    rules: structuredClone(rules),
                  });
                  setPrevious(p);
                  setReviewed(false);
                }}
              >
                Review a correction
              </Button>
            )}
          </div>
        ))}
      </div>
      {manager && (
        <section className="space-y-4 rounded-lg border p-4">
          <h3 className="font-semibold">
            {previous
              ? `Publish correction to version ${previous.version}`
              : 'Add reviewed plan'}
          </h3>
          <p className="text-sm">
            Use only plan documents without patient information. Imported text
            stays here for comparison and is never saved. Manually enter the
            allowed generic fields below.
          </p>
          <input
            type="file"
            aria-label="Read plan document locally"
            accept=".txt,.csv,.xlsx,.pdf,image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const result = await readLocalFile(file);
                setSourceText(
                  'text' in result
                    ? result.text
                    : [result.headers, ...result.rows]
                        .map((r) => r.join('\t'))
                        .join('\n'),
                );
              } catch {
                setMessage(
                  'Could not read this document locally. Paste text or enter generic fields manually.',
                );
              }
            }}
          />
          <label className="grid gap-1 text-sm">
            Local source comparison
            <textarea
              className="min-h-20 rounded border p-2"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              label="Payer directory entry"
              value={draft.payerId}
              onChange={(v) => set('payerId', v)}
            >
              <option value="">Choose payer</option>
              {data.directory.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.label}
                </option>
              ))}
            </SelectField>
            {(
              [
                'groupRaw',
                'product',
                'subgroup',
                'network',
                'benefitYear',
                'effectiveFrom',
                'effectiveTo',
                'source',
                'sourceDate',
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={
                  {
                    groupRaw: 'Group identifier (raw)',
                    product: 'Product',
                    subgroup: 'Subgroup (or confirmed N/A)',
                    network: 'Network context',
                    benefitYear: 'Benefit year',
                    effectiveFrom: 'Effective from YYYY-MM-DD',
                    effectiveTo: 'Effective through YYYY-MM-DD',
                    source: 'Source description (no patient references)',
                    sourceDate: 'Source date YYYY-MM-DD',
                  }[key]
                }
                value={draft[key]}
                onChange={(v) => set(key, v)}
              />
            ))}
            <SelectField
              label="Provider context"
              value={draft.providerId ?? ''}
              onChange={(v) => set('providerId', v || null)}
            >
              <option value="">Not provider-specific</option>
              {data.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Confidence"
              value={draft.confidence}
              onChange={(v) => set('confidence', v as PlanDraft['confidence'])}
            >
              {['high', 'medium', 'low'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </SelectField>
            {(['insurancePlanId', 'feeScheduleId', 'manualId'] as const).map(
              (key) => (
                <SelectField
                  key={key}
                  label={
                    {
                      insurancePlanId: 'Existing FOF plan (link only)',
                      feeScheduleId: 'Existing fee schedule',
                      manualId: 'Existing manual',
                    }[key]
                  }
                  value={draft[key] ?? ''}
                  onChange={(v) => set(key, v || null)}
                >
                  <option value="">No link</option>
                  {(key === 'insurancePlanId'
                    ? data.plans
                    : key === 'feeScheduleId'
                      ? data.schedules
                      : data.manuals.map((m) => ({ id: m.id, name: m.title }))
                  ).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
              ),
            )}
          </div>
          {draft.rules.map((rule, i) => (
            <div key={i}>
              <RuleEditor
                rule={rule}
                onChange={(v) =>
                  set(
                    'rules',
                    draft.rules.map((r, n) => (n === i ? v : r)),
                  )
                }
              />
              <Button
                variant="ghost"
                onClick={() =>
                  set(
                    'rules',
                    draft.rules.filter((_, n) => n !== i),
                  )
                }
              >
                Remove rule
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              set('rules', [
                ...draft.rules,
                {
                  key: 'frequency',
                  scope: 'preventive',
                  status: 'unknown',
                  value: null,
                },
              ])
            }
          >
            Add generic rule
          </Button>
          <Check
            checked={reviewed}
            onChange={setReviewed}
            label="I reviewed the source, plan identity and effective period. These fields contain generic plan rules only, with no member details or call/fax references."
          />
          <div className="flex gap-2">
            <Button
              disabled={!reviewed || busy}
              onClick={async () => {
                if (!planDraftSchema.safeParse(draft).success) {
                  setMessage(
                    'Check required identifiers, dates, rule values and units.',
                  );
                  return;
                }
                setBusy(true);
                try {
                  await publishPlan(orgId, draft, reviewed, previous);
                  setDraft(blankPlan());
                  setPrevious(undefined);
                  setReviewed(false);
                  setSourceText('');
                  setMessage(
                    'Reviewed plan version published. Existing task snapshots are unchanged.',
                  );
                  onSaved();
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Publish reviewed version
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(blankPlan());
                setPrevious(undefined);
                setReviewed(false);
                setSourceText('');
              }}
            >
              Clear draft
            </Button>
          </div>
          <p role="status">{message}</p>
        </section>
      )}
    </div>
  );
}
