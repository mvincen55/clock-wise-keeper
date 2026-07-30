import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMessagingSettings, useOwnerBoardPrefs } from '@/hooks/useMessagingSettings';
import { MESSAGING_SETTING_LABELS } from '@/lib/messaging-settings';
import { useOrgContext } from '@/hooks/useOrgContext';

export default function MessagingSettingsCard() {
  const { data: ctx } = useOrgContext();
  const { settings, save, canEdit } = useMessagingSettings();
  const { prefs, save: savePrefs } = useOwnerBoardPrefs();
  const isOwner = ctx?.role === 'owner';

  if (!canEdit) return null;
  const L = MESSAGING_SETTING_LABELS;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Messaging</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label className="flex-1 text-xs font-normal">{L.enabled.label}</Label>
          <Switch
            checked={settings.enabled}
            onCheckedChange={v => save.mutate({ enabled: v })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{L.messages_label.label}</Label>
            <Input
              defaultValue={settings.messages_label}
              onBlur={e => save.mutate({ messages_label: e.target.value.trim() || 'Messages' })}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{L.requests_label.label}</Label>
            <Input
              defaultValue={settings.requests_label}
              onBlur={e =>
                save.mutate({ requests_label: e.target.value.trim() || 'Doctor Requests' })
              }
              className="h-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{L.categories.label}</Label>
          <Input
            defaultValue={settings.categories.join(', ')}
            onBlur={e =>
              save.mutate({
                categories: e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean),
              })
            }
            className="h-9"
          />
          <p className="text-[10px] text-muted-foreground">Separate with commas.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{L.retention_days.label}</Label>
            <Select
              value={String(settings.retention_days)}
              onValueChange={v => save.mutate({ retention_days: Number(v) })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[7, 14, 30, 60, 90].map(d => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{L.closeout_cutoff_minutes.label}</Label>
            <Select
              value={String(settings.closeout_cutoff_minutes)}
              onValueChange={v => save.mutate({ closeout_cutoff_minutes: Number(v) })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[15, 30, 45, 60].map(m => (
                  <SelectItem key={m} value={String(m)}>
                    Last {m} min don’t count
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Label className="flex-1 text-xs font-normal">{L.closeout_item_enabled.label}</Label>
          <Switch
            checked={settings.closeout_item_enabled}
            onCheckedChange={v => save.mutate({ closeout_item_enabled: v })}
          />
        </div>

        {isOwner && (
          <div className="space-y-4 rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 leading-tight">
                <Label className="text-xs font-normal">{L.share_with_manager.label}</Label>
                <p className="text-[10px] text-muted-foreground">
                  Read-only, and off unless you turn it on.
                </p>
              </div>
              <Switch
                checked={prefs.share_with_manager}
                onCheckedChange={v => savePrefs.mutate({ share_with_manager: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{L.digest_frequency.label}</Label>
              <Select
                value={prefs.digest_frequency}
                onValueChange={v =>
                  savePrefs.mutate({ digest_frequency: v as 'daily' | 'weekly' | 'never' })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
