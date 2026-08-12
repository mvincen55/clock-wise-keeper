import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { GENERIC_TARGETS, getRolePresets, type RoleKey } from './goal-examples';

/**
 * Role-based SMART starters plus one-tap measurable targets. Purely a helper:
 * picking an example fills the fields, and everything stays editable.
 *
 * The starters are the curated presets in goal-examples.ts, shown instantly —
 * no AI round-trip. The only office-specific number any of them asserts (the
 * confirmation window) is read from Practice Settings, so the wording never
 * contradicts how the office actually works.
 */
export default function RoleGoalIdeas({
  onPickExample,
  onPickTarget,
}: {
  onPickExample: (idea: { title: string; target: string }) => void;
  onPickTarget: (target: string) => void;
}) {
  const [role, setRole] = useState<RoleKey | null>(null);
  // Wording follows the office's confirmation policy; falls back to the
  // shipped default until the settings query resolves.
  const { data: practice } = usePracticeSettings();
  const presets = useMemo(
    () => getRolePresets(practice?.confirmation_lead_days),
    [practice?.confirmation_lead_days]
  );
  const preset = presets.find(r => r.key === role) ?? null;

  const ideas = preset?.ideas ?? [];
  const targets = preset ? preset.targets : GENERIC_TARGETS;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-primary/30 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        Need a starting point? Pick your role.
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map(r => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRole(role === r.key ? null : r.key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              role === r.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:border-primary/50'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {ideas.length > 0 && (
        <div className="space-y-1.5">
          {ideas.map(idea => (
            <Button
              key={idea.title}
              type="button"
              variant="ghost"
              onClick={() => onPickExample({ title: idea.title, target: idea.target })}
              className="h-auto w-full justify-start whitespace-normal rounded-md border border-border/60 bg-background px-2.5 py-2 text-left text-xs font-normal leading-snug hover:border-primary/50"
            >
              <Plus className="mr-2 mt-0.5 h-3 w-3 shrink-0 text-primary" />
              <span>
                {idea.title}
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Measured by: {idea.target}
                </span>
              </span>
            </Button>
          ))}
        </div>
      )}

      {targets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">
            {preset ? 'Measurable targets that fit this role' : 'Ways to make any goal measurable'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {targets.map(t => (
              <Badge
                key={t}
                variant="secondary"
                onClick={() => onPickTarget(t)}
                className="cursor-pointer text-[11px] font-normal hover:bg-primary hover:text-primary-foreground"
              >
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
