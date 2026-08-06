import { PenLine, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useMyStaffCode } from '@/hooks/useStaffCodes';
import { isLegacyStaffCode, staffCodeLabel } from '@/lib/staff-code';

/**
 * Personal profile card: shows the member's canonical office-assigned staff
 * code (`employees.tag`). This is the ONE code used for official attribution
 * across the app (Forms, Broken Appointments, reports, version history).
 *
 * It is assigned by a manager/owner on the Team page and is intentionally NOT
 * self-editable here — this replaces the deprecated self-set profile initials
 * so there is a single source of truth.
 */
export function StaffInitialsCard() {
  const { code, isLoading } = useMyStaffCode();
  const legacy = isLegacyStaffCode(code);

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5" />
          Your Staff Code
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-md border bg-muted px-3 py-1.5 font-mono text-lg tracking-wider">
            {isLoading ? '…' : staffCodeLabel(code)}
          </span>
          {legacy && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Update to 3–4 characters
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {code
            ? 'Your staff code is stamped on official records (Forms, reports, version history) instead of your name or email.'
            : 'You don’t have a staff code yet. Ask a manager to assign one on the Team page so your actions are attributed.'}
          {legacy && ' This 2-character code is legacy — a manager should update it to a 3–4 character code on the Team page.'}
        </p>
        <p className="text-xs text-muted-foreground">
          Staff codes are 3–4 uppercase characters, unique to your office, and assigned by a manager or owner.
        </p>
      </CardContent>
    </Card>
  );
}
