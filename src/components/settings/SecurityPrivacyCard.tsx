import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Timer } from 'lucide-react';

/** Personal security preference: this device's auto-logout timeout. */
export default function SecurityPrivacyCard() {
  const { sessionTimeoutMinutes, setSessionTimeoutMinutes } = useAuth();

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security &amp; Privacy
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Timer className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <Label className="text-sm font-medium">Auto-Logout Timeout</Label>
            <p className="text-xs text-muted-foreground">Minutes of inactivity before automatic sign out (0 = disabled)</p>
          </div>
          <Input
            type="number"
            min={0}
            max={480}
            value={sessionTimeoutMinutes}
            onChange={e => setSessionTimeoutMinutes(parseInt(e.target.value) || 0)}
            className="w-24 text-sm"
          />
        </div>
      </CardContent>
    </Card>
  );
}
