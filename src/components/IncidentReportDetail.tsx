import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, Loader2, Pencil, Printer, Trash2 } from 'lucide-react';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import IncidentReportPrintSheet from '@/components/IncidentReportPrintSheet';
import IncidentSignaturePanel from '@/components/IncidentSignaturePanel';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import {
  useDeleteIncidentReport,
  useReviewIncidentReport,
  type IncidentReport,
} from '@/hooks/useIncidentReports';
import { formatDate } from '@/lib/time-utils';
import {
  CATEGORY_LABELS,
  PPE_LABELS,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  STATUSES,
  STATUS_CLASSES,
  STATUS_LABELS,
  SIGNATURE_CLASSES,
  SIGNATURE_LABELS,
  TREATMENT_LABELS,
  formatClockTime,
  labelFor,
  signatureState,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incidents';

/**
 * One incident report in full, plus the manager review panel.
 *
 * Everyone who can open this can read every fact on it — the employee it
 * is about sees the same page their managers do, review notes included.
 * Only owners and managers can change the status, the review notes, or
 * the follow-up flag (RLS and a guard trigger enforce that server-side).
 */

type Props = {
  report: IncidentReport | null;
  employeeName: string;
  onClose: () => void;
  onEdit?: (report: IncidentReport) => void;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '—'}</p>
    </div>
  );
}

export default function IncidentReportDetail({
  report,
  employeeName,
  onClose,
  onEdit,
}: Props) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: branding } = useOrgBranding();
  const review = useReviewIncidentReport();
  const remove = useDeleteIncidentReport();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  // The author may keep correcting their own account while it is open.
  const canEdit =
    !!report && (isManager || (report.reported_by === user?.id && report.status === 'open'));

  const [status, setStatus] = useState<string>('open');
  const [reviewNotes, setReviewNotes] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Re-sync when a different report opens, and again whenever the row
  // itself moves — signing off bumps an untouched report to under review,
  // and the panel has to say so rather than offer to set it back.
  useEffect(() => {
    if (!report) return;
    setStatus(report.status);
    setReviewNotes(report.review_notes);
    setFollowUpRequired(report.follow_up_required);
    setFollowUpNotes(report.follow_up_notes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.id, report?.updated_at]);

  if (!report) return null;

  const time = formatClockTime(report.incident_time);
  const dirty =
    status !== report.status ||
    reviewNotes !== report.review_notes ||
    followUpRequired !== report.follow_up_required ||
    followUpNotes !== report.follow_up_notes;

  const handleDelete = async () => {
    await remove.mutateAsync(report.id);
    setConfirmDelete(false);
    onClose();
  };

  return (
    <>
      <Dialog open={!!report} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {labelFor(CATEGORY_LABELS, report.category)}
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  SEVERITY_CLASSES[report.severity as IncidentSeverity] ??
                  'bg-muted text-muted-foreground'
                }`}
              >
                {labelFor(SEVERITY_LABELS, report.severity)}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  STATUS_CLASSES[report.status as IncidentStatus] ??
                  'bg-muted text-muted-foreground'
                }`}
              >
                {labelFor(STATUS_LABELS, report.status)}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${
                  SIGNATURE_CLASSES[signatureState(report)]
                }`}
              >
                {SIGNATURE_LABELS[signatureState(report)]}
              </span>
            </DialogTitle>
            <DialogDescription>
              {employeeName} · {formatDate(report.incident_date)}
              {time ? ` at ${time}` : ''} · filed by {report.reported_by_name || '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Row label="Location" value={report.location} />
              <Row label="Body part" value={report.body_part} />
              <Row label="Instrument / device" value={report.device_involved} />
              <Row label="PPE worn" value={labelFor(PPE_LABELS, report.ppe_worn)} />
              <Row
                label="Medical treatment"
                value={labelFor(TREATMENT_LABELS, report.medical_treatment)}
              />
              <Row label="Work days missed" value={String(report.days_away)} />
            </div>

            <div>
              <p className="text-xs text-muted-foreground">What happened</p>
              <p className="text-sm whitespace-pre-wrap">{report.description}</p>
            </div>

            {report.immediate_action && (
              <div>
                <p className="text-xs text-muted-foreground">Action taken immediately</p>
                <p className="text-sm whitespace-pre-wrap">{report.immediate_action}</p>
              </div>
            )}

            {report.witnesses && <Row label="Witnesses" value={report.witnesses} />}
            {!report.work_related && (
              <p className="text-xs text-muted-foreground">Marked as not work related.</p>
            )}

            <IncidentSignaturePanel report={report} employeeName={employeeName} />

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Manager review</p>
                {report.reviewed_by_name && (
                  <p className="text-xs text-muted-foreground">
                    Last reviewed by {report.reviewed_by_name}
                    {report.reviewed_at ? ` · ${formatDate(report.reviewed_at)}` : ''}
                  </p>
                )}
              </div>

              {isManager ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end pb-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="ir-follow-up"
                          checked={followUpRequired}
                          onCheckedChange={setFollowUpRequired}
                        />
                        <Label htmlFor="ir-follow-up" className="font-normal">
                          Follow-up required
                        </Label>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ir-review-notes">Review notes</Label>
                    <Textarea
                      id="ir-review-notes"
                      rows={3}
                      value={reviewNotes}
                      onChange={e => setReviewNotes(e.target.value)}
                      placeholder="What was done about it, and what changes prevent a repeat."
                    />
                  </div>
                  {followUpRequired && (
                    <div className="space-y-1.5">
                      <Label htmlFor="ir-follow-up-notes">Follow-up plan</Label>
                      <Textarea
                        id="ir-follow-up-notes"
                        rows={2}
                        value={followUpNotes}
                        onChange={e => setFollowUpNotes(e.target.value)}
                        placeholder="e.g. Bloodwork scheduled, source evaluation requested."
                      />
                      <p className="text-xs text-muted-foreground">
                        Keep test results and patient details out — record that follow-up
                        happened, not what it found.
                      </p>
                    </div>
                  )}
                  <Button
                    size="sm"
                    disabled={!dirty || review.isPending}
                    onClick={() =>
                      review.mutate({
                        id: report.id,
                        status,
                        reviewNotes,
                        followUpRequired,
                        followUpNotes,
                      })
                    }
                  >
                    {review.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Review
                  </Button>
                </>
              ) : (
                <div className="space-y-2">
                  <Row label="Notes" value={report.review_notes} />
                  {report.follow_up_required && (
                    <Row label="Follow-up" value={report.follow_up_notes || 'Required'} />
                  )}
                  {!report.reviewed_by_name && (
                    <p className="text-xs text-muted-foreground">
                      Not reviewed yet. Your managers have been notified.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* The printed page, on screen. Same component the printer
                gets, so the preview cannot drift from the paper. */}
            <div className="rounded-lg border">
              <button
                type="button"
                onClick={() => setShowPreview(v => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
              >
                Print preview
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    showPreview ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {showPreview && branding && (
                <div className="border-t p-3">
                  <ScaledPrintPreview>
                    <IncidentReportPrintSheet
                      report={report}
                      employeeName={employeeName}
                      branding={branding}
                    />
                  </ScaledPrintPreview>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
              </Button>
              {canEdit && onEdit && (
                <Button variant="outline" size="sm" onClick={() => onEdit(report)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </Button>
              )}
              {isManager && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Choose “Save as PDF” as the destination to file it digitally.
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this incident report?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from {employeeName}'s record for good. Safety records are
              usually corrected rather than deleted — edit it instead if the facts changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print-only: the filed report as one letter page. Portaled so
          printing shows nothing but the sheet (same mechanism as the FOF
          and the Deposit Log). */}
      {branding &&
        createPortal(
          <div className="incident-print-root">
            <BrandPrintStyle branding={branding} />
            <IncidentReportPrintSheet
              report={report}
              employeeName={employeeName}
              branding={branding}
            />
          </div>,
          document.body
        )}
    </>
  );
}
