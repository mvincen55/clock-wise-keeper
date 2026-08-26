import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { usePracticeSettings, useUpsertPracticeSettings } from '@/hooks/usePracticeSettings';

/**
 * Office policy for PIN-verified sign-offs (the attestation primitive).
 * Defaults are the product: PIN required, 5 attempts, 15-minute lock —
 * every number here is the office's to change.
 */
export default function SignoffPinSettingsCard() {
  const { data: settings } = usePracticeSettings();
  const upsert = useUpsertPracticeSettings();

  const [requirePin, setRequirePin] = useState(true);
  const [attempts, setAttempts] = useState('5');
  const [minutes, setMinutes] = useState('15');

  useEffect(() => {
    if (!settings) return;
    setRequirePin(settings.require_pin_on_signoff);
    setAttempts(String(settings.pin_lockout_attempts));
    setMinutes(String(settings.pin_lockout_minutes));
  }, [settings]);

  const save = () => {
    const a = Number(attempts);
    const m = Number(minutes);
    if (!Number.isInteger(a) || a < 1 || a > 10) {
      toast.error('Attempts before lock must be between 1 and 10.');
      return;
    }
    if (!Number.isInteger(m) || m < 1 || m > 1440) {
      toast.error('Lock length must be between 1 and 1440 minutes.');
      return;
    }
    upsert.mutate(
      {
        require_pin_on_signoff: requirePin,
        pin_lockout_attempts: a,
        pin_lockout_minutes: m,
      },
      {
        onSuccess: () => toast.success('Sign-off PIN settings saved'),
        onError: e => toast.error(e instanceof Error ? e.message : 'Could not save settings'),
      },
    );
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Sign-off PINs
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Require a PIN on sign-offs</p>
            <p className="text-xs text-muted-foreground">
              On: sign-offs (like onboarding items) are confirmed with each person&apos;s
              server-verified PIN and recorded as verified. Off: sign-offs fall back to
              typed initials and are marked unverified on the record.
            </p>
          </div>
          <Switch checked={requirePin} onCheckedChange={setRequirePin} />
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <Label htmlFor="pin-attempts" className="text-xs">
              Wrong attempts before lock
            </Label>
            <Input
              id="pin-attempts"
              type="number"
              min={1}
              max={10}
              value={attempts}
              onChange={e => setAttempts(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pin-minutes" className="text-xs">
              Lock length (minutes)
            </Label>
            <Input
              id="pin-minutes"
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
            />
          </div>
        </div>

        <Button size="sm" onClick={save} disabled={upsert.isPending}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
