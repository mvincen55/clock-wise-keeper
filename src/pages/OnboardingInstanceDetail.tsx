import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  CircleDashed,
  Loader2,
  PenLine,
  Printer,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import OnboardingRecordPrintSheet from '@/components/onboarding/OnboardingRecordPrintSheet';
import SignoffDialog from '@/components/onboarding/SignoffDialog';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import {
  useOnboardingInstance,
  type OnboardingInstanceItem,
} from '@/hooks/useOnboardingInstances';
import {
  isItemComplete,
  progressOf,
  slotLabel,
  toSignoffState,
  type SignoffSlot,
} from '@/lib/onboarding-signoff';
import { formatDate } from '@/lib/time-utils';

/**
 * One hire's onboarding: the snapshot checklist with dual sign-off per
 * item. Tapping an open item opens the sign-off dialog (PIN or, when the
 * office turned PINs off, the unverified initials fallback). The printed
 * record shows initials, verification status, and dates.
 */

function SlotChip({ slot, side }: { slot: SignoffSlot; side: string }) {
  const label = slotLabel(slot);
  if (label === 'unsigned') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CircleDashed className="h-3 w-3" />
        {side}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      {label === 'verified' ? (
        <BadgeCheck className="h-3 w-3 text-primary" />
      ) : (
        <PenLine className="h-3 w-3 text-muted-foreground" />
      )}
      <span className="font-mono">{slot.initials || '—'}</span>
      <span className="text-muted-foreground">
        {slot.signed_at ? formatDate(slot.signed_at.slice(0, 10)) : ''}
        {label === 'unverified' ? ' · unverified' : ''}
      </span>
    </span>
  );
}

export default function OnboardingInstanceDetail() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const { data: detail, isLoading } = useOnboardingInstance(instanceId);
  const { data: branding } = useOrgBranding();
  const { data: staff } = useOrgStaff();

  const [signItem, setSignItem] = useState<OnboardingInstanceItem | null>(null);

  const employeeName = useMemo(() => {
    if (!detail) return '';
    return (
      (staff ?? []).find(m => m.employeeId === detail.instance.employee_id)?.displayName ??
      'Team member'
    );
  }, [detail, staff]);

  const sections = useMemo(() => {
    const list: Array<{ title: string; items: OnboardingInstanceItem[] }> = [];
    for (const item of detail?.items ?? []) {
      const last = list[list.length - 1];
      if (last && last.title === item.section_title) last.items.push(item);
      else list.push({ title: item.section_title, items: [item] });
    }
    return list;
  }, [detail?.items]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Onboarding record not found.</p>
        <Link to="/new-hires">
          <Button variant="outline" className="mt-4">
            Back
          </Button>
        </Link>
      </div>
    );
  }

  const { instance, items } = detail;
  const progress = progressOf(items.map(toSignoffState));
  const pct = progress.total ? Math.round((progress.complete / progress.total) * 100) : 0;
  // The dialog reflects the freshest row so a just-signed side shows signed.
  const liveSignItem = signItem ? items.find(i => i.id === signItem.id) ?? null : null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/new-hires">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate">{employeeName}</h1>
          <p className="text-muted-foreground">
            {instance.template_name}
            {instance.role_label ? ` · ${instance.role_label}` : ''} · started{' '}
            {formatDate(instance.started_at.slice(0, 10))}
          </p>
        </div>
        {instance.status === 'complete' ? (
          <Badge variant="secondary">Complete</Badge>
        ) : (
          <Badge variant="outline">In progress</Badge>
        )}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print record
        </Button>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span>
              {progress.complete} of {progress.total} items signed off by both people
            </span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />
        </CardContent>
      </Card>

      {sections.map(section => (
        <Card key={section.title + section.items[0]?.id} className="card-elevated">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {section.items.map(item => {
                const state = toSignoffState(item);
                const complete = isItemComplete(state);
                return (
                  <button
                    key={item.id}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-default"
                    onClick={() => !complete && instance.status === 'active' && setSignItem(item)}
                    disabled={complete || instance.status !== 'active'}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${complete ? 'text-muted-foreground' : ''}`}>
                          {item.item_title}
                        </p>
                        {item.item_detail && (
                          <p className="text-xs text-muted-foreground">{item.item_detail}</p>
                        )}
                      </div>
                      {complete && (
                        <Badge variant="secondary" className="shrink-0">
                          Done
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <SlotChip slot={state.trainer} side="Trainer" />
                      <SlotChip slot={state.trainee} side="New hire" />
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <SignoffDialog
        open={!!signItem}
        onClose={() => setSignItem(null)}
        item={liveSignItem}
        instanceId={instance.id}
        traineeEmployeeId={instance.employee_id}
        traineeName={employeeName}
      />

      {/* Print-only: the record on the office letterhead. */}
      {branding &&
        createPortal(
          <div className="onboarding-print-root">
            <BrandPrintStyle branding={branding} />
            <OnboardingRecordPrintSheet
              employeeName={employeeName}
              templateName={instance.template_name}
              roleLabel={instance.role_label}
              startedAt={instance.started_at}
              status={instance.status}
              completedAt={instance.completed_at}
              items={items}
              branding={branding}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
