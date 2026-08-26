import { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useMyPinStatus, useSetEmployeePin } from '@/hooks/useEmployeePins';
import { useOrgContext } from '@/hooks/useOrgContext';
import { validatePinInput, lockRemainingMinutes } from '@/lib/attestation';

/**
 * Personal profile card: the member's sign-off PIN. On shared office
 * terminals the PIN — verified server-side, stored only as a hash — is what
 * proves it was THIS person confirming a sign-off, not whoever the terminal
 * was signed in as. Members with their own login manage their own here;
 * managers set or reset anyone's from the employee's Team profile.
 */
export function MyPinCard() {
  const { data: ctx } = useOrgContext();
  const { data: status, isLoading } = useMyPinStatus();
  const setPin = useSetEmployeePin();

  const [editing, setEditing] = useState(false);
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState<string | null>(null);

  const lockedMins = lockRemainingMinutes(status?.lockedUntil);

  const save = () => {
    const check = validatePinInput(pin);
    if (!check.ok) return setReason(check.reason ?? null);
    if (pin !== confirm) return setReason('The two entries do not match.');
    setReason(null);
    setPin.mutate(
      { employeeId: ctx!.employee_id, pin },
      {
        onSuccess: () => {
          toast.success(status?.hasPin ? 'PIN updated' : 'PIN set');
          setEditing(false);
          setPinValue('');
          setConfirm('');
        },
        onError: e => setReason(e instanceof Error ? e.message : 'Could not save the PIN.'),
      },
    );
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Your Sign-off PIN
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={status?.hasPin ? 'secondary' : 'outline'}>
            {isLoading ? '…' : status?.hasPin ? 'Set' : 'Not set'}
          </Badge>
          {lockedMins > 0 && (
            <Badge variant="destructive" className="gap-1">
              <Lock className="h-3 w-3" />
              Locked for {lockedMins} min
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Your PIN confirms it was you when you sign something off on a shared office
          computer — like an onboarding checklist item. It is verified by the server and
          stored only in scrambled form; nobody can look it up, including managers.
        </p>

        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {status?.hasPin ? 'Change PIN' : 'Set a PIN'}
          </Button>
        ) : (
          <div className="space-y-2 max-w-xs">
            <div>
              <Label htmlFor="my-pin" className="text-xs">
                New PIN (4-8 digits)
              </Label>
              <Input
                id="my-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={pin}
                onChange={e => setPinValue(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            <div>
              <Label htmlFor="my-pin-confirm" className="text-xs">
                Repeat it
              </Label>
              <Input
                id="my-pin-confirm"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={confirm}
                onChange={e => setConfirm(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
            {reason && <p className="text-xs text-destructive">{reason}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={setPin.isPending}>
                Save PIN
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setPinValue('');
                  setConfirm('');
                  setReason(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
