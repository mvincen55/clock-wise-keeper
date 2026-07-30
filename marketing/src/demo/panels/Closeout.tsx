import { useState } from "react";
import { FieldLabel, cx } from "@/components/Primitives";
import { DemoNote } from "../DemoNote";
import { demo } from "@/content/site";

/* Seeded fake staff. Nothing here comes from a live office. */
const ME = "Dana Whitfield";
const TIMES = ["5:41 pm", "5:42 pm", "5:44 pm", "5:47 pm", "5:49 pm", "5:51 pm", "5:53 pm", "5:56 pm"];
/* One box is pre-ticked by someone else, so the "only managers can un-check
   somebody else's box" rule is reachable without setup. */
const SEEDED_OTHER = { index: 3, who: "Ruth Calloway", at: "5:38 pm" };

export function CloseoutPanel() {
  const p = demo.panels.closeout;
  const [ticked, setTicked] = useState<Record<number, string>>({ [SEEDED_OTHER.index]: SEEDED_OTHER.who });
  const [blocked, setBlocked] = useState(false);

  const count = Object.keys(ticked).length;
  const total = p.items.length;
  const complete = count === total;

  function toggle(i: number) {
    setBlocked(false);
    setTicked((prev) => {
      const next = { ...prev };
      if (next[i]) {
        if (next[i] !== ME) {
          setBlocked(true);
          return prev;
        }
        delete next[i];
      } else {
        next[i] = ME;
      }
      return next;
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <div className="border border-carbon bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-carbon p-4 sm:p-5">
            <div>
              <FieldLabel>{p.title}</FieldLabel>
              <p className="mt-1.5 text-[0.9rem] text-ink/55">Thursday · signed in as {ME}</p>
            </div>
            <p className="pe-label tnum text-ink/50">
              {count} / {total}
            </p>
          </div>

          <ul>
            {p.items.map((item, i) => {
              const by = ticked[i];
              const mine = by === ME;
              return (
                <li key={item} className="border-b border-carbon last:border-0">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={Boolean(by)}
                    className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-purple-50 sm:gap-4"
                  >
                    {/* Square box, square tick. Thumb-sized target. */}
                    <span
                      aria-hidden="true"
                      className={cx(
                        "mt-[1px] flex h-[26px] w-[26px] shrink-0 items-center justify-center border-2",
                        by ? "border-purple-600 bg-purple-600" : "border-ink/30 bg-white",
                      )}
                    >
                      {by && (
                        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
                          <path d="M2.5 8 L6 11.5 L12.5 4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="square" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block text-[1rem] leading-snug", by ? "text-ink/45 line-through" : "text-ink")}>
                        {item}
                      </span>
                      {by && (
                        <span className="pe-label mt-1.5 block text-purple-600">
                          ✓ {by}
                          <span className="ml-2 text-ink/40">{mine ? TIMES[i] : SEEDED_OTHER.at}</span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div aria-live="polite" className="border-t border-carbon p-4 sm:p-5">
            {blocked ? (
              <p className="text-[0.95rem] text-flag">
                Completed by {SEEDED_OTHER.who} — only managers can un-check it.
              </p>
            ) : complete ? (
              <p className="text-[0.95rem] font-medium text-purple-700">{p.done}</p>
            ) : (
              <p className="text-[0.95rem] text-ink/60">{p.lockedNote}</p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-[0.98rem] leading-relaxed text-ink/75">{p.note}</p>
        <DemoNote k={p.unfinished.k} v={p.unfinished.v} status={p.unfinished.status} />
      </div>
    </div>
  );
}
