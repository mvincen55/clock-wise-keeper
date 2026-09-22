import { useOfficeNudges } from '@/hooks/useOfficeNudges';
import NudgeCard from '@/components/nudges/NudgeCard';
import { MicroLabel } from '@/components/dashboard/kit';

/** Kinds another card already owns: the sprint idea renders on the sprint card. */
const OWNED_ELSEWHERE = new Set(['sprint_suggestion']);

/**
 * The nudges aimed at Home (surface "dashboard"), for the signed-in person,
 * open only. Nothing to say means nothing rendered: no header, no empty
 * card, no count. Handled notes are gone from here; the assistant stays
 * quiet when there is nothing worth saying.
 */
export default function HomeNudges() {
  const { data: nudges } = useOfficeNudges(false);
  const mine = (nudges ?? []).filter(n => n.surface === 'dashboard' && !OWNED_ELSEWHERE.has(n.kind));
  if (mine.length === 0) return null;
  return (
    <section className="space-y-4" aria-labelledby="home-nudges">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 border-foreground pt-4">
        <MicroLabel><span id="home-nudges">Nudges</span></MicroLabel>
        <p className="text-[12.5px] text-muted-foreground">Quiet notes from the office assistant, each showing the recorded data behind it.</p>
      </div>
      <div className="space-y-3">
        {mine.map(n => <NudgeCard key={n.id} nudge={n} />)}
      </div>
    </section>
  );
}
