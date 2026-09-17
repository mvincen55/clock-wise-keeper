import { Button } from '@/components/ui/button';
import type { ReviewColumn } from '@/lib/schedule-provider-mapping';

type Named = { id: string; displayName: string; active: boolean };

function PickRow<T extends Named>({ label, items, index, onPick }: { label: string; items: Array<{ provider: T; reason: string }>; index: number; onPick: (p: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {items.map(({ provider, reason }) => (
        <Button key={provider.id} type="button" size="sm" variant="outline" className="h-7 text-xs" title={reason}
          aria-label={`Use ${provider.displayName} for column ${index + 1}`} onClick={() => onPick(provider)}>
          {provider.displayName}
        </Button>
      ))}
    </div>
  );
}

/**
 * One-click picks for a column that has no provider yet: the reader's likely
 * match first (with its reason in plain words), then other evidence-backed
 * possibilities, and failing those the providers not placed anywhere yet.
 * Nothing here is chosen for the closer — every button is their decision.
 */
export function QuickPicks<T extends Named>({ column, index, providers, unplaced, onPick }: {
  column: ReviewColumn; index: number; providers: T[]; unplaced: T[]; onPick: (provider: T) => void;
}) {
  const candidates = (column.suggestion?.candidates ?? [])
    .map(c => ({ ...c, provider: providers.find(p => p.id === c.providerId) }))
    .filter((c): c is typeof c & { provider: T } => !!c.provider?.active);
  const likely = candidates.filter(c => c.strength === 'likely');
  const possible = candidates.filter(c => c.strength === 'possible');
  if (likely.length > 0) {
    return (
      <div className="space-y-1.5">
        {likely.map(c => (
          <div key={c.providerId} className="flex flex-wrap items-center gap-2 text-xs">
            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs"
              aria-label={`Use ${c.provider.displayName} for column ${index + 1}`} onClick={() => onPick(c.provider)}>
              Use {c.provider.displayName}
            </Button>
            <span className="text-muted-foreground">Likely — {c.reason}.</span>
          </div>
        ))}
        {possible.length > 0 && <PickRow label="Also possible:" items={possible} index={index} onPick={onPick} />}
      </div>
    );
  }
  if (possible.length > 0) return <PickRow label="Possible:" items={possible} index={index} onPick={onPick} />;
  if (unplaced.length > 0 && unplaced.length <= 6) {
    return <PickRow label="Not placed yet:" items={unplaced.map(p => ({ provider: p, reason: 'Not placed in any column yet' }))} index={index} onPick={onPick} />;
  }
  return null;
}
