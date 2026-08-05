import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Lightbulb, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePracticeSettings } from '@/hooks/usePracticeSettings';
import { useRoleGoalIdeas } from '@/hooks/useGoals';
import { GENERIC_TARGETS, getRolePresets, type RoleKey } from './goal-examples';

/**
 * Role-based SMART starters plus one-tap measurable targets. Purely a helper:
 * picking an example fills the fields, and everything stays editable.
 *
 * Ideas come from Pathfinder grounded in the office's ACTUAL policy material
 * (org settings, assistant memories, published knowledge) — each one shows the
 * policy it is based on. The shipped example presets appear only when
 * Pathfinder can't answer, clearly labeled as examples.
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

  const grounded = useRoleGoalIdeas(role);
  const usingFallback = !!role && grounded.isError;
  const ideas: { title: string; target: string; basis?: string }[] =
    grounded.data?.ideas ?? (usingFallback ? (preset?.ideas ?? []) : []);
  // Never show the shipped example chips while a policy-grounded answer is
  // still possible; generic placeholders carry no office-specific claims.
  const targets = !role
    ? GENERIC_TARGETS
    : grounded.isLoading
      ? []
      : grounded.data
        ? (grounded.data.targets.length > 0 ? grounded.data.targets : GENERIC_TARGETS)
        : (preset?.targets ?? []);

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

      {role && grounded.isLoading && (
        <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Reading your office&apos;s policies…
        </div>
      )}

      {role && usingFallback && ideas.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Couldn&apos;t read your office&apos;s policies right now — these are generic
          examples, so check them against how your office actually works.
        </p>
      )}

      {role && ideas.length > 0 && (
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
                {idea.basis ? (
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                    Based on: {idea.basis}
                  </span>
                ) : null}
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
