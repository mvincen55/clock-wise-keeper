import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CircleDashed, PenLine } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAttest } from '@/hooks/useEmployeePins';
import { useFallbackSignoff, type OnboardingInstanceItem } from '@/hooks/useOnboardingInstances';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import { attestFailureMessage, validatePinInput } from '@/lib/attestation';
import {
  slotLabel,
  toSignoffState,
  validateFallbackInitials,
  type SignoffSlot,
} from '@/lib/onboarding-signoff';
import { formatDate } from '@/lib/time-utils';

/**
 * Dual sign-off on a shared terminal: one dialog, two independent panels —
 * trainer and new hire — signed in either order. With PINs required (the
 * default) each side confirms with their own PIN, verified server-side via
 * the attest function; the server decides which slot the attestation lands
 * in. With PINs off, the office falls back to typed initials (prefilled
 * from the staff code, editable) and the slot is recorded UNVERIFIED.
 */

function SignedBadge({ slot }: { slot: SignoffSlot }) {
  const label = slotLabel(slot);
  if (label === 'unsigned') return null;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-lg tracking-wider">{slot.initials || '—'}</span>
      <div className="text-xs text-muted-foreground">
        {slot.signed_at ? formatDate(slot.signed_at.slice(0, 10)) : ''}
      </div>
      {label === 'verified' ? (
        <Badge variant="secondary" className="gap-1">
          <BadgeCheck className="h-3 w-3" />
          PIN verified
        </Badge>
      ) : (
        <Badge variant="outline" className="gap-1">
          <PenLine className="h-3 w-3" />
          Unverified
        </Badge>
      )}
    </div>
  );
}

export default function SignoffDialog({
  open,
  onClose,
  item,
  instanceId,
  traineeEmployeeId,
  traineeName,
}: {
  open: boolean;
  onClose: () => void;
  item: OnboardingInstanceItem | null;
  instanceId: string;
  traineeEmployeeId: string;
  traineeName: string;
}) {
  const qc = useQueryClient();
  const { data: settings } = usePracticeSettings();
  const { data: staff } = useOrgStaff();
  const attest = useAttest();
  const fallback = useFallbackSignoff();

  const requirePin = settings?.require_pin_on_signoff ?? true;

  const [trainerId, setTrainerId] = useState('');
  const [trainerPin, setTrainerPin] = useState('');
  const [traineePin, setTraineePin] = useState('');
  const [trainerInitials, setTrainerInitials] = useState('');
  const [traineeInitials, setTraineeInitials] = useState('');
  const [trainerError, setTrainerError] = useState<string | null>(null);
  const [traineeError, setTraineeError] = useState<string | null>(null);

  const trainers = useMemo(
    () =>
      (staff ?? []).filter(
        m => m.employeeId !== traineeEmployeeId && m.employmentStatus === 'active',
      ),
    [staff, traineeEmployeeId],
  );
  const codeByEmployee = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of staff ?? []) if (m.code) map.set(m.employeeId, m.code);
    return map;
  }, [staff]);

  const state = item ? toSignoffState(item) : null;

  // Editable-initials pattern: prefill the new hire's initials from their
  // staff code on open; the person can still type over it.
  useEffect(() => {
    if (open && !requirePin) {
      setTraineeInitials(codeByEmployee.get(traineeEmployeeId) ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requirePin, traineeEmployeeId, item?.id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['onboarding-instance', instanceId] });
    qc.invalidateQueries({ queryKey: ['onboarding-instances'] });
  };

  const reset = () => {
    setTrainerId('');
    setTrainerPin('');
    setTraineePin('');
    setTrainerInitials('');
    setTraineeInitials('');
    setTrainerError(null);
    setTraineeError(null);
  };

  const signWithPin = (side: 'trainer' | 'trainee') => {
    if (!item) return;
    const employeeId = side === 'trainer' ? trainerId : traineeEmployeeId;
    const pin = side === 'trainer' ? trainerPin : traineePin;
    const setError = side === 'trainer' ? setTrainerError : setTraineeError;
    if (side === 'trainer' && !employeeId) {
      setError('Pick who trained this item.');
      return;
    }
    const check = validatePinInput(pin);
    if (!check.ok) {
      setError(check.reason ?? null);
      return;
    }
    setError(null);
    attest.mutate(
      {
        employeeId,
        pin,
        actionType: 'onboarding_item_signoff',
        relatedTable: 'onboarding_instance_items',
        relatedId: item.id,
      },
      {
        onSuccess: res => {
          if (res.ok) {
            toast.success(side === 'trainer' ? 'Trainer signed' : `${traineeName} signed`);
            if (side === 'trainer') setTrainerPin('');
            else setTraineePin('');
            refresh();
          } else {
            setError(attestFailureMessage(res.failure ?? {}));
          }
        },
        onError: () => setError('The sign-off service is unreachable. Try again.'),
      },
    );
  };

  const signFallback = (side: 'trainer' | 'trainee') => {
    if (!item) return;
    const initials = side === 'trainer' ? trainerInitials : traineeInitials;
    const setError = side === 'trainer' ? setTrainerError : setTraineeError;
    if (side === 'trainer' && !trainerId) {
      setError('Pick who trained this item.');
      return;
    }
    const check = validateFallbackInitials(initials);
    if (!check.ok) {
      setError(check.reason ?? null);
      return;
    }
    setError(null);
    fallback.mutate(
      {
        itemId: item.id,
        instanceId,
        side,
        initials: initials.trim().toUpperCase(),
        trainerEmployeeId: side === 'trainer' ? trainerId : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Signed (unverified)');
          refresh();
        },
        onError: e => setError(e instanceof Error ? e.message : 'Could not record it.'),
      },
    );
  };

  const panel = (side: 'trainer' | 'trainee') => {
    if (!state) return null;
    const slot = side === 'trainer' ? state.trainer : state.trainee;
    const error = side === 'trainer' ? trainerError : traineeError;
    return (
      <div className="flex-1 space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">
          {side === 'trainer' ? 'Trainer' : `New hire — ${traineeName}`}
        </p>
        {slotLabel(slot) !== 'unsigned' ? (
          <SignedBadge slot={slot} />
        ) : (
          <div className="space-y-2">
            {side === 'trainer' && (
              <Select
                value={trainerId}
                onValueChange={v => {
                  setTrainerId(v);
                  if (!requirePin) setTrainerInitials(codeByEmployee.get(v) ?? '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Who trained this?" />
                </SelectTrigger>
                <SelectContent>
                  {trainers.map(t => (
                    <SelectItem key={t.employeeId} value={t.employeeId}>
                      {t.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {requirePin ? (
              <>
                <div>
                  <Label className="text-xs">PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    value={side === 'trainer' ? trainerPin : traineePin}
                    onChange={e => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      if (side === 'trainer') setTrainerPin(v);
                      else setTraineePin(v);
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={attest.isPending}
                  onClick={() => signWithPin(side)}
                >
                  Confirm with PIN
                </Button>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Initials</Label>
                  <Input
                    autoComplete="off"
                    maxLength={8}
                    value={side === 'trainer' ? trainerInitials : traineeInitials}
                    onChange={e => {
                      const v = e.target.value.toUpperCase();
                      if (side === 'trainer') setTrainerInitials(v);
                      else setTraineeInitials(v);
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  disabled={fallback.isPending}
                  onClick={() => signFallback(side)}
                >
                  Sign (unverified)
                </Button>
              </>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDashed className="h-4 w-4" />
            {item?.item_title ?? 'Sign off'}
          </DialogTitle>
          <DialogDescription>
            {requirePin
              ? 'Both people confirm with their own PIN — either order. The PIN is checked by the server, never on this screen.'
              : 'PINs are off for this office: sign-offs record typed initials and are marked unverified on the record.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 sm:flex-row">
          {panel('trainer')}
          {panel('trainee')}
        </div>
      </DialogContent>
    </Dialog>
  );
}
