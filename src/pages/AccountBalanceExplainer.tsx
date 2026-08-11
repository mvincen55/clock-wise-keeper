/**
 * ACCOUNT BALANCE EXPLAINER — /account-balance
 *
 * Turns a Dentrix ledger into a clear, printed explanation of what the
 * patient owes: capture → verify → smart review → patient explanation →
 * print & clear. All financial logic lives in src/lib/account-balance;
 * this page only orchestrates the workflow.
 *
 * HIPAA boundary: every patient value on this page (ledger rows, patient
 * name, staff answers, the generated explanation) exists ONLY in React
 * memory for the active session. It must never be sent to Supabase,
 * written to localStorage/sessionStorage/IndexedDB, placed in the URL,
 * logged, toasted, or passed to analytics or any AI endpoint. Screenshots
 * are destroyed by the capture dialog immediately after local OCR.
 * Leaving the page, refreshing, or Start over destroys everything.
 */
import { useEffect, useMemo, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBlocker } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Camera, Eraser, Eye, FileSearch, ListChecks,
  Pencil, Plus, Printer, RotateCcw, ShieldCheck, Wallet,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import AccountBalancePrintSheet, {
  type AbxPracticeInfo,
} from '@/components/account-balance/AccountBalancePrintSheet';
import LedgerCaptureDialog from '@/components/account-balance/LedgerCaptureDialog';
import LedgerVerifyTable from '@/components/account-balance/LedgerVerifyTable';
import ReadinessPanel from '@/components/account-balance/ReadinessPanel';
import SmartReviewPanel from '@/components/account-balance/SmartReviewPanel';
import { buildPatientExplanation, buildReadiness } from '@/lib/account-balance/explanation';
import { formatCents } from '@/lib/account-balance/money';
import { inferPatientName } from '@/lib/account-balance/parser';
import { buildSmartReview } from '@/lib/account-balance/questions';
import { findBalanceEpisode, reconcileLedger } from '@/lib/account-balance/reconcile';
import {
  EMPTY_SESSION,
  ledgerSessionReducer,
  sessionHasPatientData,
  type WorkflowStage,
} from '@/lib/account-balance/session';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';

const STAGES: Array<{ key: WorkflowStage; label: string; icon: typeof Camera }> = [
  { key: 'capture', label: 'Capture Ledger', icon: Camera },
  { key: 'verify', label: 'Verify', icon: FileSearch },
  { key: 'review', label: 'Smart Review', icon: ListChecks },
  { key: 'explanation', label: 'Patient Explanation', icon: Eye },
];

export default function AccountBalanceExplainer() {
  const { data: branding } = useOrgBranding();
  const [state, dispatch] = useReducer(ledgerSessionReducer, EMPTY_SESSION);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'work' | 'preview'>('work');

  // ---- derived, all in memory -------------------------------------------
  const inference = useMemo(() => inferPatientName(state.rows), [state.rows]);
  const patientName = state.patientNameOverride ?? inference.name;
  const patientNameConflict = state.patientNameOverride === null && inference.conflict;

  const reconciliation = useMemo(() => reconcileLedger(state.rows), [state.rows]);
  const episode = useMemo(
    () => findBalanceEpisode(state.rows, reconciliation),
    [state.rows, reconciliation]
  );
  const { questions, internalBlocks, waiverLinks } = useMemo(
    () =>
      buildSmartReview({
        rows: state.rows,
        reconciliation,
        episode,
        answers: state.answers,
        patientNameConflict,
      }),
    [state.rows, reconciliation, episode, state.answers, patientNameConflict]
  );
  const explanation = useMemo(
    () =>
      buildPatientExplanation({
        rows: state.rows,
        reconciliation,
        episode,
        answers: state.answers,
        internalBlocks,
        waiverLinks,
        patientName,
      }),
    [state.rows, reconciliation, episode, state.answers, internalBlocks, waiverLinks, patientName]
  );
  const readiness = useMemo(
    () =>
      buildReadiness({
        rows: state.rows,
        reconciliation,
        questions,
        answers: state.answers,
        patientName,
        patientNameConflict,
        explanation,
      }),
    [state.rows, reconciliation, questions, state.answers, patientName, patientNameConflict, explanation]
  );

  const hasPatientData = sessionHasPatientData(state);

  // In-app navigation guard: leaving with a live ledger session discards it —
  // the user chooses between staying and discarding, never a silent loss.
  const blocker = useBlocker(hasPatientData);

  // Browser-level warning before closing/refreshing with a live session.
  useEffect(() => {
    if (!hasPatientData) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPatientData]);

  const practice: AbxPracticeInfo = useMemo(() => {
    const b = branding ?? GENERIC_BRANDING;
    return {
      practiceName: b.legalName.trim() || b.displayName,
      addressLine1: b.addressLine1,
      addressLine2: b.addressLine2,
      phone: b.phone,
      website: b.website,
      logoUrl: b.logoUrl,
    };
  }, [branding]);

  const sheet = explanation ? (
    <AccountBalancePrintSheet practice={practice} explanation={explanation} />
  ) : null;

  const stage = state.stage;
  const stageIndex = STAGES.findIndex(s => s.key === stage);
  const setStage = (next: WorkflowStage) => dispatch({ type: 'setStage', stage: next });

  const startOver = () => {
    if (hasPatientData) setClearConfirmOpen(true);
    else dispatch({ type: 'clearAll' });
  };

  const doPrint = () => {
    if (!readiness.ready) return;
    window.print();
    dispatch({ type: 'markPrinted' });
    // Land on the explanation stage so the "Finished with this patient?"
    // clear reminder is front and center after the print dialog closes.
    dispatch({ type: 'setStage', stage: 'explanation' });
  };

  const unresolvedSummary = readiness.items.filter(i => !i.passed);

  // ---- stage content -----------------------------------------------------
  const captureStage = (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 py-6">
          <p className="text-sm">
            Bring the patient's Dentrix ledger onto the screen, then capture it here.
            A long ledger can be captured in several screenshots — repeated rows at the
            seam are stitched together automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCaptureOpen(true)}>
              {state.captureCount === 0 ? (
                <Camera className="h-4 w-4 mr-1.5" />
              ) : (
                <Plus className="h-4 w-4 mr-1.5" />
              )}
              {state.captureCount === 0 ? 'Capture ledger' : 'Add another ledger screenshot'}
            </Button>
            {state.rows.length > 0 && (
              <Button variant="outline" onClick={() => setStage('verify')}>
                <ArrowRight className="h-4 w-4 mr-1.5" />
                Continue to Verify
              </Button>
            )}
          </div>
          {state.rows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {state.rows.length} row{state.rows.length === 1 ? '' : 's'} read from{' '}
              {state.captureCount} screenshot{state.captureCount === 1 ? '' : 's'}
              {state.lastOverlapRemoved
                ? ` — ${state.lastOverlapRemoved} overlapping row${state.lastOverlapRemoved === 1 ? '' : 's'} at the seam ${state.lastOverlapRemoved === 1 ? 'was' : 'were'} merged automatically`
                : ''}
              .
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const patientOutliers = inference.outlierRowIds;

  const verifyStage = (
    <div className="space-y-4">
      {patientNameConflict && (
        <Alert variant="destructive">
          <AlertTitle>Multiple patient names were detected</AlertTitle>
          <AlertDescription>
            Make sure these screenshots belong to one account ({inference.distinctNames.join(' · ')}).
            Fix the Patient column below or set the correct name — printing stays blocked until this
            is resolved.
          </AlertDescription>
        </Alert>
      )}
      {!patientNameConflict && patientOutliers.length > 0 && (
        <Alert>
          <FileSearch className="h-4 w-4" />
          <AlertTitle>
            {patientOutliers.length === 1
              ? 'One patient cell looks garbled'
              : `${patientOutliers.length} patient cells look garbled`}
          </AlertTitle>
          <AlertDescription>
            The ledger consistently reads as {inference.name || 'one patient'} — the highlighted
            cell{patientOutliers.length === 1 ? '' : 's'} below just didn't scan cleanly. Fix or
            confirm {patientOutliers.length === 1 ? 'it' : 'them'}; this is not treated as a second
            patient account.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="abx-patient-name">Patient name</Label>
          <Input
            id="abx-patient-name"
            className="w-64"
            placeholder={inference.conflict ? 'Type the correct name…' : 'Read from the ledger'}
            value={patientName}
            onChange={e => dispatch({ type: 'setPatientName', name: e.target.value })}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setCaptureOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add another screenshot
        </Button>
      </div>
      <LedgerVerifyTable
        rows={state.rows}
        reconciliation={reconciliation}
        patientOutlierRowIds={patientOutliers}
        onUpdateRow={(rowId, patch) => dispatch({ type: 'updateRow', rowId, patch })}
        onMarkVerified={rowId => dispatch({ type: 'markVerified', rowId })}
        onDeleteRow={rowId => dispatch({ type: 'deleteRow', rowId })}
        onAddRowAfter={rowId => dispatch({ type: 'addRowAfter', rowId })}
        onMoveRow={(rowId, direction) => dispatch({ type: 'moveRow', rowId, direction })}
      />
    </div>
  );

  const reviewStage = (
    <div className="space-y-4">
      {internalBlocks.some(b => b.netsToZero) && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Internal Dentrix adjustments</AlertTitle>
          <AlertDescription>
            Internal Dentrix adjustments net to $0.00 and will not appear on the patient
            statement.
          </AlertDescription>
        </Alert>
      )}
      <SmartReviewPanel
        questions={questions}
        answers={state.answers}
        onAnswer={(questionId, optionId, note) =>
          dispatch({ type: 'answer', questionId, optionId, note })
        }
        onClearAnswer={questionId => dispatch({ type: 'clearAnswer', questionId })}
      />
    </div>
  );

  const explanationStage = (
    <div className="space-y-4">
      {explanation === null ? (
        <Alert variant="destructive">
          <AlertTitle>This ledger does not reconcile yet.</AlertTitle>
          <AlertDescription>
            The patient explanation is generated only when every running balance matches
            the math to the penny. Go back to Verify and correct the highlighted row.
          </AlertDescription>
        </Alert>
      ) : !readiness.ready ? (
        <Alert>
          <AlertTitle>Almost there</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {unresolvedSummary.map(item => (
                <li key={item.key}>{item.detail || item.label}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : state.printed ? (
        <Alert className="border-primary/40 bg-primary/5">
          <Eraser className="h-4 w-4" />
          <AlertTitle>Finished with this patient?</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Patient information stays on this device only. Clear it before helping the
              next patient.
            </p>
            <Button size="sm" onClick={() => setClearConfirmOpen(true)}>
              <Eraser className="h-4 w-4 mr-1.5" />
              Clear patient data &amp; start new
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-emerald-600/40 bg-emerald-600/5">
          <Printer className="h-4 w-4" />
          <AlertTitle>Ready for patient</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              The reconciliation passed and every question is answered — the explanation
              to the right is exactly what prints on US Letter.
            </p>
            <Button size="sm" onClick={doPrint}>
              <Printer className="h-4 w-4 mr-1.5" />
              Print for {explanation.patientName || 'patient'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {explanation !== null && (
        <Card className="xl:hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Patient explanation — exactly what prints</CardTitle>
          </CardHeader>
          <CardContent>
            <ScaledPrintPreview>{sheet}</ScaledPrintPreview>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const workColumn = (
    <div className="space-y-4">
      {/* Stage stepper */}
      <div className="flex flex-wrap gap-1.5">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const enabled = i === 0 || state.rows.length > 0;
          return (
            <Button
              key={s.key}
              size="sm"
              variant={stage === s.key ? 'default' : 'outline'}
              disabled={!enabled}
              onClick={() => setStage(s.key)}
              className="text-xs"
            >
              <Icon className="h-3.5 w-3.5 mr-1.5" />
              {i + 1}. {s.label}
            </Button>
          );
        })}
      </div>

      {stage === 'capture' && captureStage}
      {stage === 'verify' && verifyStage}
      {stage === 'review' && reviewStage}
      {stage === 'explanation' && explanationStage}

      {state.rows.length > 0 && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={stageIndex === 0}
            onClick={() => setStage(STAGES[Math.max(0, stageIndex - 1)].key)}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          {stageIndex < STAGES.length - 1 && (
            <Button size="sm" onClick={() => setStage(STAGES[stageIndex + 1].key)}>
              Next
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const sideColumn = (
    <div className="space-y-4">
      <ReadinessPanel
        rowCount={state.rows.length}
        reconciliation={reconciliation}
        readiness={readiness}
      />
      {explanation !== null && (
        <Card className="hidden xl:block">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Patient explanation — exactly what prints</CardTitle>
          </CardHeader>
          <CardContent>
            <ScaledPrintPreview>{sheet}</ScaledPrintPreview>
          </CardContent>
        </Card>
      )}
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Wallet className="h-6 w-6 text-primary" />
          Account Balance Explainer
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={startOver} disabled={!hasPatientData}>
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Start over
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setStage('explanation');
              setMobilePane('preview');
            }}
            variant="outline"
            disabled={explanation === null}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Preview Patient Explanation
          </Button>
          <Button size="sm" onClick={doPrint} disabled={!readiness.ready} title={
            readiness.ready ? undefined : 'Complete the readiness checklist first'
          }>
            <Printer className="h-4 w-4 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Patient information stays on this device</AlertTitle>
        <AlertDescription>
          The ledger is read locally, screenshots are destroyed right after they're read,
          and everything here is cleared when you print, start over, or leave this page.
          Nothing is saved or sent anywhere.
        </AlertDescription>
      </Alert>

      {/* Phones/tablets: one pane at a time. Desktop: work + status side by side. */}
      <div className="flex gap-2 xl:hidden">
        <Button
          variant={mobilePane === 'work' ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          onClick={() => setMobilePane('work')}
        >
          <Pencil className="h-4 w-4 mr-1.5" />
          Workflow
        </Button>
        <Button
          variant={mobilePane === 'preview' ? 'default' : 'outline'}
          size="sm"
          className="flex-1"
          onClick={() => setMobilePane('preview')}
        >
          <Eye className="h-4 w-4 mr-1.5" />
          Status &amp; Preview
        </Button>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className={mobilePane === 'work' ? '' : 'hidden xl:block'}>{workColumn}</div>
        <div className={mobilePane === 'preview' ? '' : 'hidden xl:block'}>{sideColumn}</div>
      </div>

      <LedgerCaptureDialog
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        captureNumber={state.captureCount + 1}
        onApply={parsed => {
          dispatch({ type: 'addCapture', rows: parsed.rows });
          dispatch({ type: 'setStage', stage: 'verify' });
        }}
      />

      {/* In-app navigation guard: stay, or discard the session and leave. */}
      <AlertDialog
        open={blocker.state === 'blocked'}
        onOpenChange={open => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave and discard this ledger session?</AlertDialogTitle>
            <AlertDialogDescription>
              Patient information here is temporary and never saved. Leaving this page
              discards the captured ledger, answers, and explanation — there is no way to
              come back to them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Stay here</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch({ type: 'clearAll' });
                blocker.proceed?.();
              }}
            >
              Discard and leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual clear confirmation */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear patient data?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases the captured ledger rows, the patient name, staff answers, and the
              generated explanation{explanation ? ` (current balance ${formatCents(explanation.currentBalanceCents)})` : ''}.
              Nothing was ever saved, so this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch({ type: 'clearAll' });
                setClearConfirmOpen(false);
                setMobilePane('work');
              }}
            >
              Clear patient data &amp; start new
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Brand accent for the preview and printed sheets (org rows). */}
      {branding && <BrandPrintStyle branding={branding} />}

      {/* Hidden print copy, portaled outside #root so print CSS can show only
          the sheet. Same props as the preview — cannot diverge. Mounted only
          when READY FOR PATIENT, so an unready draft can never be printed. */}
      {sheet && readiness.ready &&
        createPortal(<div className="abx-print-root">{sheet}</div>, document.body)}
    </div>
  );
}
