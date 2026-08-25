import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  useClearEmployeePin,
  usePinStatus,
  useSetEmployeePin,
} from '@/hooks/useEmployeePins';
import { validatePinInput, lockRemainingMinutes } from '@/lib/attestation';

/**
 * Owner/manager control for one employee's sign-off PIN: set it the first
 * time, reset it when forgotten (which also clears any lockout), or remove
 * it. The PIN is hashed server-side on save — it is never stored or shown
 * anywhere after this dialog closes.
 */
export default function PinManagementDialog({
  employeeId,
  employeeName,
  open,
  onClose,
}: {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: status } = usePinStatus(open ? employeeId : undefined);
  const setPin = useSetEmployeePin();
  const clearPin = useClearEmployeePin();

  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState<string | null>(null);

  const lockedMins = lockRemainingMinutes(status?.lockedUntil);

  const reset = () => {
    setPinValue('');
    setConfirm('');
    setReason(null);
  };

  const save = () => {
    const check = validatePinInput(pin);
    if (!check.ok) return setReason(check.reason ?? null);
    if (pin !== confirm) return setReason('The two entries do not match.');
    setReason(null);
    setPin.mutate(
      { employeeId, pin },
      {
        onSuccess: () => {
          toast.success(`PIN ${status?.hasPin ? 'reset' : 'set'} for ${employeeName}`);
          reset();
          onClose();
        },
        onError: e => setReason(e instanceof Error ? e.message : 'Could not save the PIN.'),
      },
    );
  };

  const remove = () => {
    clearPin.mutate(
      { employeeId },
      {
        onSuccess: () => {
          toast.success(`PIN removed for ${employeeName}`);
          reset();
          onClose();
        },
        onError: e =>
          toast.error(e instanceof Error ? e.message : 'Could not remove the PIN.'),
      },
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign-off PIN — {employeeName}</DialogTitle>
          <DialogDescription>
            The PIN this team member enters to confirm sign-offs on a shared
            computer. Saving a new one replaces the old and clears any lockout.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Badge variant={status?.hasPin ? 'secondary' : 'outline'}>
            {status?.hasPin ? 'PIN set' : 'No PIN yet'}
          </Badge>
          {lockedMins > 0 && (
            <Badge variant="destructive">Locked for {lockedMins} min</Badge>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <Label htmlFor="emp-pin" className="text-xs">
              New PIN (4-8 digits)
            </Label>
            <Input
              id="emp-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={e => setPinValue(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div>
            <Label htmlFor="emp-pin-confirm" className="text-xs">
              Repeat it
            </Label>
            <Input
              id="emp-pin-confirm"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={confirm}
              onChange={e => setConfirm(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          {reason && <p className="text-xs text-destructive">{reason}</p>}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {status?.hasPin ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={remove}
              disabled={clearPin.isPending}
            >
              Remove PIN
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={setPin.isPending}>
            {status?.hasPin ? 'Reset PIN' : 'Set PIN'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
