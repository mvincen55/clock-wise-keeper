import { useState } from 'react';
import { format } from 'date-fns';
import { History, Eye, GitCompareArrows, RotateCcw, Copy, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import ScaledPrintPreview from '@/components/ScaledPrintPreview';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import ConsentPrintSheet from '@/components/consents/ConsentPrintSheet';
import { useConsentFormVersions, useCreateConsentForm, useRestoreConsentVersion } from '@/hooks/useConsentForms';
import { GENERIC_BRANDING, useOrgBranding } from '@/hooks/useOrgBranding';
import { useStaffCodeMap } from '@/hooks/useStaffCodes';
import { attributionLabel, resolveStaffCode } from '@/lib/staff-code';
import type { ConsentForm, ConsentFormVersion } from '@/lib/consents/types';

/**
 * Version history: every published revision, kept forever. A restore copies
 * a past version into the working draft (publishing it is still an explicit
 * step) — an approved form is never overwritten without its prior version
 * surviving here.
 */
export default function VersionHistoryDialog({
  form,
  open,
  onOpenChange,
}: {
  form: ConsentForm;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: versions = [], isLoading } = useConsentFormVersions(open ? form.id : null);
  const { data: branding = GENERIC_BRANDING } = useOrgBranding();
  // Attribution shows the canonical staff code (never a name/email fallback).
  const staffCodes = useStaffCodeMap();
  const restoreVersion = useRestoreConsentVersion();
  const createForm = useCreateConsentForm();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [viewing, setViewing] = useState<ConsentFormVersion | null>(null);
  const [compareA, setCompareA] = useState<ConsentFormVersion | null>(null);
  const [compareB, setCompareB] = useState<ConsentFormVersion | null>(null);
  const [selectingCompare, setSelectingCompare] = useState(false);

  const sheetFor = (version: ConsentFormVersion) => (
    <ConsentPrintSheet
      form={{ ...form, currentVersion: version.version }}
      content={version.content}
      branding={branding}
      fill={null}
      versionDate={version.publishedAt}
    />
  );

  const pickForCompare = (version: ConsentFormVersion) => {
    if (!compareA) {
      setCompareA(version);
    } else if (version.id !== compareA.id) {
      setCompareB(version);
      setSelectingCompare(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => {
      if (!next) { setViewing(null); setCompareA(null); setCompareB(null); setSelectingCompare(false); }
      onOpenChange(next);
    }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />Version history — {form.name}
          </DialogTitle>
          <DialogDescription>
            {selectingCompare
              ? compareA
                ? `Comparing v${compareA.version} — pick the second version.`
                : 'Pick the first version to compare.'
              : 'Every published revision is kept. Restoring copies a version into the draft.'}
          </DialogDescription>
        </DialogHeader>

        {viewing || (compareA && compareB) ? (
          <>
            <BrandPrintStyle branding={branding} />
            <div className={`flex-1 overflow-y-auto rounded-lg bg-muted/50 p-3 ${compareB ? 'grid gap-3 md:grid-cols-2' : ''}`}>
              {viewing && <ScaledPrintPreview>{sheetFor(viewing)}</ScaledPrintPreview>}
              {compareA && compareB && (
                <>
                  <div>
                    <p className="pb-1 text-xs font-semibold text-muted-foreground">v{compareA.version} · {format(new Date(compareA.publishedAt), 'MMM d, yyyy')}</p>
                    <ScaledPrintPreview>{sheetFor(compareA)}</ScaledPrintPreview>
                  </div>
                  <div>
                    <p className="pb-1 text-xs font-semibold text-muted-foreground">v{compareB.version} · {format(new Date(compareB.publishedAt), 'MMM d, yyyy')}</p>
                    <ScaledPrintPreview>{sheetFor(compareB)}</ScaledPrintPreview>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setViewing(null); setCompareA(null); setCompareB(null); }}>
                Back to versions
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-end">
              <Button
                variant={selectingCompare ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setSelectingCompare(v => !v); setCompareA(null); setCompareB(null); }}
                disabled={versions.length < 2}
              >
                <GitCompareArrows className="mr-2 h-4 w-4" />
                {selectingCompare ? 'Cancel compare' : 'Compare versions'}
              </Button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>}
              {!isLoading && versions.length === 0 && (
                <p className="text-sm text-muted-foreground">Never published — no versions yet.</p>
              )}
              {versions.map(version => (
                <div
                  key={version.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${selectingCompare ? 'cursor-pointer hover:border-primary' : ''} ${compareA?.id === version.id ? 'border-primary' : ''}`}
                  onClick={() => selectingCompare && pickForCompare(version)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Version {version.version}
                      {version.version === form.currentVersion && <Badge className="ml-2">Current</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(version.publishedAt), 'MMM d, yyyy · h:mm a')}
                      {' · '}
                      {attributionLabel('Published', resolveStaffCode(staffCodes, version.publishedBy).code)}
                      {version.changeNotes && <> — {version.changeNotes}</>}
                    </p>
                  </div>
                  {!selectingCompare && (
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(version)}>
                        <Eye className="mr-1.5 h-3.5 w-3.5" />View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          createForm.mutate(
                            {
                              name: `${form.name} (from v${version.version})`,
                              category: form.category,
                              content: version.content,
                              procedureCodes: form.procedureCodes,
                              isFinancial: form.isFinancial,
                              source: 'duplicate',
                              auditAction: 'form_duplicated',
                            },
                            {
                              onSuccess: copy => {
                                toast({ title: 'Duplicated as a new draft form' });
                                onOpenChange(false);
                                navigate(`/consents/builder/${copy.id}`);
                              },
                            },
                          )
                        }
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />Duplicate
                      </Button>
                      {version.version !== form.currentVersion && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            restoreVersion.mutate(
                              { form, version },
                              {
                                onSuccess: () => {
                                  toast({
                                    title: `v${version.version} restored to draft`,
                                    description: 'Publish it to make it the current version.',
                                  });
                                  onOpenChange(false);
                                },
                              },
                            )
                          }
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restore
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
