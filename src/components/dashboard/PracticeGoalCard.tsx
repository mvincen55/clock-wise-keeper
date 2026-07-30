import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  formatDollars,
  useCollectionsMonthToDate,
  usePracticeSettings,
  useSavePracticeSettings,
} from '@/hooks/usePracticeGoal';
import { monthElapsedFraction, monthLabel } from '@/hooks/useGoals';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * The office's shared number for the month. The target is a setting; the
 * money is summed live from the deposit log. Same calm pacing language as
 * personal goals — amber only when badly trailing the calendar.
 */
export default function PracticeGoalCard() {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  const { data: settings } = usePracticeSettings();
  const { data: mtd } = useCollectionsMonthToDate();
  const save = useSavePracticeSettings();
  const [draft, setDraft] = useState('');

  const target = settings?.monthly_collections_target_cents ?? null;
  const visibleToMe = isAdmin || settings?.collections_visibility !== 'admins';

  // No target yet: only admins see the nudge to set one.
  if (!target) {
    if (!isAdmin) return null;
    return (
      <Card className="card-elevated">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <p className="font-medium">Set the monthly collections target</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Give the practice one shared number for the month. Progress is counted from the
            deposit log automatically.
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="135000"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="max-w-40"
            />
            <Button
              disabled={!draft || save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync({
                    monthly_collections_target_cents: Math.round(Number(draft) * 100),
                  });
                  toast.success('Monthly target set.');
                  setDraft('');
                } catch (e: any) {
                  toast.error(e?.message || 'Could not save the target.');
                }
              }}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!visibleToMe) return null;

  const cents = mtd?.cents ?? 0;
  const month = mtd?.month ?? '';
  const pct = target > 0 ? Math.min(1, cents / target) : 0;
  const elapsed = month ? monthElapsedFraction(month) : 0;
  const behind = pct + 0.15 < elapsed;

  return (
    <Card className="card-elevated">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {month ? monthLabel(month) : 'This month'} · Practice goal
            </p>
            <p className="font-semibold flex items-baseline gap-1.5">
              <span className="text-lg">Collections</span>
              <span className="text-sm text-muted-foreground">
                {formatDollars(cents)} of {formatDollars(target)}
              </span>
            </p>
          </div>
          <TrendingUp className={cn('h-5 w-5', behind ? 'text-warning' : 'text-primary')} />
        </div>

        <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', behind ? 'bg-warning' : 'bg-primary')}
            style={{ width: `${pct * 100}%` }}
          />
          <div
            className="absolute top-0 h-full w-px bg-foreground/40"
            style={{ left: `${elapsed * 100}%` }}
            aria-hidden
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {Math.round(pct * 100)}% collected · {Math.round(elapsed * 100)}% through the month
          {behind ? ' — trailing the calendar.' : '.'}
          {isAdmin && (
            <>
              {' '}
              <Link to="/deposit-log" className="text-primary hover:underline">
                Deposit log →
              </Link>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
