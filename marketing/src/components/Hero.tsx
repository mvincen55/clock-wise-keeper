import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, FieldLabel, Perforation, cx } from "./Primitives";

/**
 * The hero is the product, not a headline over a gradient. Four real items
 * off the assistant's daily list, genuinely tickable, on the two-copy sheet
 * that the rest of the site is built out of.
 */
const ITEMS = [
  "Run suction line cleaner",
  "Log out of practice management software",
  "Complete daily deposit",
  "Confirm suction & compressor are off (if last one out)",
];

function HeroSheet() {
  const [done, setDone] = useState<number[]>([0]);
  const complete = done.length === ITEMS.length;

  return (
    <div className="w-full">
      <div className="pe-sheet">
        <div className="flex items-center justify-between gap-3 border-b border-carbon px-4 py-3">
          <FieldLabel>Clinical — Assistant · Daily</FieldLabel>
          <span className="pe-label tnum text-ink/45">
            {done.length}/{ITEMS.length}
          </span>
        </div>
        <ul>
          {ITEMS.map((item, i) => {
            const on = done.includes(i);
            return (
              <li key={item} className="border-b border-carbon last:border-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-purple-50"
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "mt-[1px] flex h-[24px] w-[24px] shrink-0 items-center justify-center border-2",
                      on ? "border-purple-600 bg-purple-600" : "border-ink/30 bg-white",
                    )}
                  >
                    {on && (
                      <svg width="14" height="14" viewBox="0 0 15 15" aria-hidden="true">
                        <path d="M2.5 8 L6 11.5 L12.5 4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="square" />
                      </svg>
                    )}
                  </span>
                  <span className={cx("text-[0.98rem] leading-snug", on ? "text-ink/45 line-through" : "text-ink")}>
                    {item}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Perforation />

      {/* The carbon copy underneath. */}
      <div className="pe-carbon-copy px-4 py-3">
        <p aria-live="polite" className="text-[0.92rem] leading-relaxed">
          {complete ? (
            <span className="font-medium text-purple-700">
              Closed out. Every box carries a name and a time.
            </span>
          ) : (
            <>Every box records who ticked it. Un-ticking somebody else's needs a manager.</>
          )}
        </p>
      </div>
    </div>
  );
}

export function Hero({
  eyebrow,
  h1,
  sub,
  kill,
  demoNote,
  crossLink,
  extraAction,
}: {
  eyebrow: string;
  h1: string;
  sub: string;
  kill: string;
  demoNote: string;
  crossLink: { to: string; label: string };
  /** Used on the office-manager page to surface "send this to your doctor". */
  extraAction?: { href: string; label: string };
}) {
  return (
    <section className="bg-paper">
      <div className="mx-auto w-full max-w-[1180px] px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-14">
        {/*
          DOM order is claim → live sheet → actions.

          On a phone that stacks in exactly that order, so the sheet is
          reachable in one scroll instead of sitting below two screens of
          headline — this is the primary experience.

          At lg the same three children auto-place into a 2-column grid as
          claim(r1c1) / sheet(r1c2) / actions(r2c1), which is the desktop
          layout, without duplicating any markup.
        */}
        <div className="flex flex-col gap-9 lg:grid lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-x-16 lg:gap-y-10">
          <div>
            <FieldLabel>{eyebrow}</FieldLabel>

            <h1 className="mt-5 text-[clamp(2.3rem,7vw,3.7rem)]">{h1}</h1>

            <p className="mt-6 max-w-prose text-[1.08rem] leading-relaxed text-ink/80">{sub}</p>

            {/* The mis-sort kill, given its own weight in the first screenful. */}
            <p className="mt-5 max-w-prose border-l-2 border-purple-600 pl-4 text-[1.08rem] font-medium leading-relaxed">
              {kill}
            </p>
          </div>

          <div className="lg:row-span-2">
            <HeroSheet />
            <p className="mt-4 text-[0.92rem] leading-relaxed text-ink/55">
              {demoNote}{" "}
              <a
                href="#try"
                className="text-ink/75 underline decoration-carbon underline-offset-4 hover:text-ink hover:decoration-purple-600"
              >
                The full sandbox is below
              </a>
              , including the deposit log and the estimate.
            </p>
          </div>

          <div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button href="#book" className="sm:w-auto">
                Book a 20-minute call
              </Button>
              <Button href={extraAction?.href ?? "#price"} variant="outline" className="sm:w-auto">
                {extraAction?.label ?? "See the price"}
              </Button>
            </div>

            <p className="pe-label mt-5 text-ink/50">No sales calls. Ever.</p>

            <Link
              to={crossLink.to}
              className="mt-7 inline-block text-[0.95rem] text-ink/60 underline decoration-carbon underline-offset-4 transition-colors hover:text-ink hover:decoration-purple-600"
            >
              {crossLink.label} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
