import { PenLine } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useMyProfile, useUpdateMyInitials } from '@/hooks/useMyProfile';
import { deriveInitials } from '@/lib/broken-appts/outputs';

/**
 * Personal profile card: the initials stamped into Broken Appointments
 * output blocks (Pop-Up, appointment note, ledger checklist). Blank =
 * derived from the full name; an explicit value here wins.
 */
export function StaffInitialsCard() {
  const { toast } = useToast();
  const { data: profile } = useMyProfile();
  const update = useUpdateMyInitials();
  const derived = deriveInitials(profile?.fullName ?? '');

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5" />
          Your Initials
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        <Label className="text-xs" htmlFor="staff-initials">
          Initials on Dentrix notes, Pop-Ups, and checklists
        </Label>
        <Input
          id="staff-initials"
          value={profile?.initials ?? ''}
          onChange={e =>
            update.mutate(e.target.value, {
              onError: (err: Error) =>
                toast({ title: 'Error', description: err.message, variant: 'destructive' }),
            })
          }
          placeholder={derived || 'e.g. MV'}
          maxLength={4}
          className="w-28 uppercase"
        />
        <p className="text-xs text-muted-foreground">
          {derived
            ? `Blank uses "${derived}" from your name. You can still adjust them inline on any single output.`
            : 'Set the initials stamped into your output blocks; you can still adjust them inline on any single output.'}
        </p>
      </CardContent>
    </Card>
  );
}
