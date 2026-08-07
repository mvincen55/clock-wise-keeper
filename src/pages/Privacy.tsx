import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail } from 'lucide-react';
import PrivacyTermsBody from '@/components/onboarding/PrivacyTermsBody';

/**
 * Standalone privacy & terms surface. Public route: the same document members
 * acknowledge during onboarding, readable any time — including before sign-in.
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
        </Button>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="text-2xl">Privacy &amp; Terms</CardTitle>
          </CardHeader>
          <CardContent>
            <PrivacyTermsBody />
          </CardContent>
        </Card>
        <p className="flex items-center justify-center gap-1.5 pb-4 text-xs text-muted-foreground">
          <Mail className="h-3 w-3 text-primary" />
          Purple Envelope — practice guidance, not patient records.
        </p>
      </div>
    </div>
  );
}
