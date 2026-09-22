import { Link } from 'react-router-dom';
import { BellRing } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PrivacyTermsCard from '@/components/onboarding/PrivacyTermsCard';
import { StaffInitialsCard } from '@/components/settings/StaffInitialsCard';
import MySignatureCard from '@/components/letterhead/MySignatureCard';
import SecurityPrivacyCard from '@/components/settings/SecurityPrivacyCard';

/**
 * My settings — personal preferences, for everyone (design §3.8): signature,
 * initials, reminders, auto-lock, privacy record. Office-wide settings live
 * under Management → Office → Office settings; the old /settings/:tab
 * addresses redirect there.
 */
export default function Settings() {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">My settings</h1>
        <p className="text-muted-foreground">Your personal preferences.</p>
        {isManager && (
          <p className="mt-1 text-sm text-muted-foreground">
            The office's settings are in <Link to="/management/office/settings" className="underline">Office settings</Link>.
          </p>
        )}
      </div>

      {/* Personal: my stored signature for office letters (self-service) */}
      <MySignatureCard />
      {/* Personal: initials stamped into Broken Appointments outputs */}
      <StaffInitialsCard />
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5" />Reminders</CardTitle>
        </CardHeader>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Your goal due-notice reminders: on/off, delivery hour, and channel.</p>
          <Button variant="outline" asChild><Link to="/settings/reminders">Open reminder settings</Link></Button>
        </CardContent>
      </Card>
      <SecurityPrivacyCard />
      <PrivacyTermsCard />
    </div>
  );
}
