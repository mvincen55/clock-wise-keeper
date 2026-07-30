import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  PERSONA_STYLES,
  POLICY_TONES,
  useRoleplaySettings,
  useSaveRoleplaySettings,
  type PersonaStyle,
  type PolicyTone,
} from '@/hooks/useRoleplaySettings';

/** Admin-only office configuration for how roleplay characters behave. */
export default function RoleplaySettingsCard() {
  const { data, isLoading } = useRoleplaySettings();
  const save = useSaveRoleplaySettings();

  const [persona, setPersona] = useState<PersonaStyle>('balanced');
  const [tone, setTone] = useState<PolicyTone>('warm_professional');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!data) return;
    setPersona(data.roleplay_persona_style);
    setTone(data.roleplay_policy_tone);
    setNotes(data.roleplay_notes ?? '');
  }, [data]);

  const dirty =
    !!data &&
    (persona !== data.roleplay_persona_style ||
      tone !== data.roleplay_policy_tone ||
      notes.trim() !== (data.roleplay_notes ?? ''));

  const submit = () => {
    save.mutate(
      { roleplay_persona_style: persona, roleplay_policy_tone: tone, roleplay_notes: notes },
      {
        onSuccess: () => toast.success('Roleplay settings saved for the office'),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : 'Could not save those settings'),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-primary" />
          Roleplay settings for this office
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          How practice patients behave, and how we sound when we answer them. Applies to every
          roleplay assessment.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Persona style</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERSONA_STYLES.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPersona(option.value)}
                className={cn(
                  'rounded-md border p-3 text-left transition-colors',
                  persona === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                )}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Policy tone</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {POLICY_TONES.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTone(option.value)}
                className={cn(
                  'rounded-md border p-3 text-left transition-colors',
                  tone === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                )}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleplay-notes">Anything else the practice patient should know</Label>
          <Textarea
            id="roleplay-notes"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="E.g. most callers ask about Delta Dental first; we never quote an exact out-of-pocket over the phone."
          />
        </div>

        <Button onClick={submit} disabled={!dirty || save.isPending || isLoading}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  );
}
