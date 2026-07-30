import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  NOTE_MAX,
  NO_PHI_WARNING,
  REFERENCE_LABEL,
  REFERENCE_MAX,
  type MessagingSettings,
} from '@/lib/messaging-settings';
import { toast } from 'sonner';

interface Props {
  settings: MessagingSettings;
  team: { user_id: string; name: string; role: string }[];
  defaultRecipient?: string;
  sending: boolean;
  onSend: (input: {
    recipient_id: string;
    category: string;
    reference: string;
    note: string;
    needs_reply: boolean;
  }) => Promise<void> | void;
}

/**
 * Structure first: who, what kind, which chart reference, then a short note.
 * The shape of the form is the strongest defence against a sentence about a
 * named patient landing in the database.
 */
export default function RequestComposer({
  settings,
  team,
  defaultRecipient,
  sending,
  onSend,
}: Props) {
  const [recipient, setRecipient] = useState(defaultRecipient ?? '');
  const [category, setCategory] = useState(settings.categories[0] ?? 'Other');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [needsReply, setNeedsReply] = useState(false);

  const submit = async () => {
    if (!recipient) return toast.error('Pick who this is going to.');
    if (!note.trim()) return toast.error('Add a short note.');
    await onSend({ recipient_id: recipient, category, reference, note, needs_reply: needsReply });
    setReference('');
    setNote('');
    setNeedsReply(false);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">To</Label>
          <Select value={recipient} onValueChange={setRecipient}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {team.map(t => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Kind</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {settings.categories.map(c => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{REFERENCE_LABEL}</Label>
        <Input
          value={reference}
          maxLength={REFERENCE_MAX}
          onChange={e => setReference(e.target.value)}
          placeholder="e.g. 4218 · Tue 10:40"
          className="h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Short note</Label>
        <Textarea
          value={note}
          maxLength={NOTE_MAX}
          onChange={e => setNote(e.target.value)}
          rows={3}
          className="resize-none text-sm"
          placeholder="What do you need?"
        />
        <div className="flex items-start gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-tight text-muted-foreground">{NO_PHI_WARNING}</p>
        </div>
        <p className="text-right text-[10px] text-muted-foreground">
          {note.length}/{NOTE_MAX}
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
        <div className="flex-1 leading-tight">
          <p className="text-xs font-medium">Needs a reply</p>
          <p className="text-[10px] text-muted-foreground">
            Leave this off for anything that is just an FYI — if everything is flagged, nothing is.
          </p>
        </div>
        <Switch checked={needsReply} onCheckedChange={setNeedsReply} />
      </div>

      <Button onClick={submit} disabled={sending} className="w-full sm:w-auto">
        Send
      </Button>
    </div>
  );
}
