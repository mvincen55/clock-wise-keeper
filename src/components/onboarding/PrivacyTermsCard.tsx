import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import PrivacyTermsBody from '@/components/onboarding/PrivacyTermsBody';
import { useOnboardingStatus } from '@/hooks/useOnboarding';
import { formatDate } from '@/lib/time-utils';

/** The privacy terms, always readable again after onboarding. */
export default function PrivacyTermsCard() {
  const { data: status } = useOnboardingStatus();
  const signedAt = status?.ack?.signed_at ?? null;

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Privacy & Terms
          </CardTitle>
          {signedAt && (
            <Badge variant="secondary" className="text-[11px]">
              Signed {formatDate(signedAt)} as {status?.ack?.signed_name}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <PrivacyTermsBody />
      </CardContent>
    </Card>
  );
}
