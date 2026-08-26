import { useState } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useCreateOrg } from '@/hooks/useOrgSetup';
import { OFFICE_TIMEZONES } from '@/components/settings/PracticeSettingsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Loader2 } from 'lucide-react';

export default function OrgSetup() {
  const { data: ctx, isLoading } = useOrgContext();
  const createOrg = useCreateOrg();
  const [orgName, setOrgName] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If already in an org, redirect logic is handled by the app
  if (ctx) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">You're already part of <strong>{ctx.org_name}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md card-elevated">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Create Your Organization</CardTitle>
          <p className="text-sm text-muted-foreground">Set up your company to start managing employees and time tracking.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Organization Name</Label>
            <Input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              onKeyDown={e => e.key === 'Enter' && orgName.trim() && createOrg.mutate({ name: orgName.trim(), timezone })}
            />
          </div>
          <div className="space-y-1">
            <Label>Office Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger aria-label="Office Timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFICE_TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Punch times are stamped on the server in this timezone. Change it any time in Settings.
            </p>
          </div>
          <Button
            className="w-full"
            onClick={() => createOrg.mutate({ name: orgName.trim(), timezone })}
            disabled={createOrg.isPending || !orgName.trim()}
          >
            {createOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Organization
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
