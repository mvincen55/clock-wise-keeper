import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import {
  useCountersignIncidentReport,
  useOrgAdmins,
  useSignIncidentReport,
  type IncidentReport,
} from '@/hooks/useIncidentReports';
import {
  SIGNATURE_CLASSES,
  SIGNATURE_LABELS,
  countersignEligibility,
  formatSignedAt,
  signatureState,
} from '@/lib/incidents';

/**
 * The two signatures a report collects: the employee it happened to
 * attests to the account, then an owner or manager signs off. Typing a
 * full name IS the signature — the server stamps who was signed in and
 * when, and refuses anything this panel would not have offered.
 *
 * A report about a manager or an owner goes up to an owner, and nobody
 * ever signs off on their own report.
 */

type Props = {
  report: IncidentReport;
  /** Who the report is about, for the waiting-on wording. */
  employeeName: string;
};

function SignedLine({ name, at, note }: { name: string; at: string | null; note?: string }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          Signed electronically · {formatSignedAt(at)}
          {note ? ` · ${note}` : ''}
        </p>
      </div>
    </div>
  );
}

/** Type-your-name signature box, shared by both slots. */
function SignBox({
  idPrefix,
  attestation,
  buttonLabel,
  pending,
  onSign,
}: {
  idPrefix: string;
  attestation: string;
  buttonLabel: string;
  pending: boolean;
  onSign: (typedName: string) => void;
}) {
  const [typedName, setTypedName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const ready = typedName.trim().length > 1 && agreed && !pending;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Checkbox
          id={`${idPrefix}-attest`}
          checked={agreed}
          onCheckedChange={v => setAgreed(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor={`${idPrefix}-attest`} className="text-xs font-normal leading-snug">
          {attestation}
        </Label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`${idPrefix}-name`}
          value={typedName}
          onChange={e => setTypedName(e.target.value)}
          placeholder="Type your full name"
          className="h-9 max-w-[240px] font-medium"
          autoComplete="off"
        />
        <Button size="sm" className="h-9" disabled={!ready} onClick={() => onSign(typedName)}>
          {pending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PenLine className="mr-2 h-4 w-4" />
          )}
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

export default function IncidentSignaturePanel({ report, employeeName }: Props) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: admins } = useOrgAdmins();
  // Only admins can read the roster; the countersign branch is the only
  // place that needs it, and only admins ever get there.
  const { data: employees } = useOrgEmployees();
  const sign = useSignIncidentReport();
  const countersign = useCountersignIncidentReport();

  const state = signatureState(report);
  const viewerIsSubject = !!ctx && report.employee_id === ctx.employee_id;
  const subjectUserId =
    employees?.find(e => e.id === report.employee_id)?.user_id ??
    (viewerIsSubject ? user?.id ?? null : null);

  const otherOwnerCount = (admins || []).filter(
    a => a.role === 'owner' && a.user_id !== subjectUserId
  ).length;

  const verdict = countersignEligibility({
    countersignRole: report.countersign_role,
    viewerRole: ctx?.role,
    viewerIsSubject,
    alreadySigned: !!report.manager_signed_at,
    otherOwnerCount,
  });

  const signOffLabel =
    report.countersign_role === 'owner' ? 'Owner sign-off' : 'Manager or owner sign-off';

  return (
    <div className="rounded-lg border p-3 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Signatures</p>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${SIGNATURE_CLASSES[state]}`}
        >
          {SIGNATURE_LABELS[state]}
        </span>
      </div>

      {/* Step one: the person it happened to. */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Employee signature
        </p>
        {report.employee_signed_at ? (
          <SignedLine name={report.employee_signature} at={report.employee_signed_at} />
        ) : viewerIsSubject ? (
          <SignBox
            idPrefix="ir-employee"
            attestation="I confirm this is an accurate account of what happened, and that I reported it."
            buttonLabel="Sign"
            pending={sign.isPending}
            onSign={typedName => sign.mutate({ id: report.id, typedName })}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Waiting on {employeeName}. They can sign it from their own record.
          </p>
        )}
      </div>

      {/* Step two: the countersignature. */}
      <div className="space-y-2 border-t pt-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{signOffLabel}</p>
        {report.manager_signed_at ? (
          <SignedLine
            name={report.manager_signature}
            at={report.manager_signed_at}
            note={report.manager_signed_role === 'owner' ? 'Owner' : 'Manager'}
          />
        ) : verdict.canSign ? (
          <>
            {!report.employee_signed_at && (
              <p className="text-xs text-muted-foreground">
                {employeeName} has not signed yet. You can still sign off — the report
                records that their signature was never given.
              </p>
            )}
            <SignBox
              idPrefix="ir-manager"
              attestation="I have reviewed this report and sign off on it."
              buttonLabel="Sign Off"
              pending={countersign.isPending}
              onSign={typedName => countersign.mutate({ id: report.id, typedName })}
            />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{verdict.reason}</p>
        )}
      </div>
    </div>
  );
}
