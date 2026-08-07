import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LifeBuoy, ShieldCheck, Mail, FileText } from 'lucide-react';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { useOrgContext } from '@/hooks/useOrgContext';

export default function Help() {
  const { data: branding } = useOrgBranding();
  const { data: ctx } = useOrgContext();
  const officeName = branding?.displayName || ctx?.org_name || 'your office';

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Help &amp; Support</h1>
        <p className="text-muted-foreground">How to get unstuck, and how this product protects {officeName}.</p>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-primary" />Contact support
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Use the floating support button in the corner of any page. It captures the page you're
            on, lets you attach a screenshot with on-device redaction, and opens a ticket you can
            follow up on right there.
          </p>
          <p>
            Screenshots are redacted before anything leaves your device — blank out anything you
            wouldn't put on the office bulletin board.
          </p>
        </CardContent>
      </Card>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />Practice guidance, not patient records
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Purple Envelope carries the doctor’s standards, preferences and approved language into
            every patient conversation — time, policies, training, forms and communication all live
            here. It is built for practice operations and team guidance, not for storing patient
            charts, clinical records or patient-identifying information: it does not keep completed
            patient forms, patient-entered values, or patient-specific financial information.
          </p>
          <p className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            <Link to="/privacy" className="text-primary hover:underline">Read the full Privacy &amp; Terms</Link>
          </p>
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Mail className="h-3 w-3 text-primary" />
        {officeName} runs on Purple Envelope.
      </p>
    </div>
  );
}
