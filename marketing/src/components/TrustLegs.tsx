import { Link } from "react-router-dom";
import { FieldLabel, cx } from "./Primitives";

/**
 * The compact, scannable version for both pages. The full argument lives on
 * /your-data. Completely straight — this sits next to a trust decision.
 */
const legs = [
  {
    n: "01",
    h: "The price is on the site",
    v: "You already saw it, with the awkward numbers underneath it. No form, no email wall, no thirty minutes of Zoom before you get a number.",
  },
  {
    n: "02",
    h: "No sales calls. Ever.",
    v: "No cold calls, no drip sequence, no “just checking in.” Book a call and go quiet and that's genuinely the end of it. The test is that nothing happens.",
  },
  {
    n: "03",
    h: "Your data leaves whenever you want",
    v: "Timesheets and attendance come out today as Excel and CSV, and everything prints. One-button export of forms and policies is not built yet — that page says exactly which half works.",
  },
];

export function TrustLegs({ tone = "deep" }: { tone?: "deep" | "paper" }) {
  const dark = tone === "deep";
  return (
    <section
      id="trust"
      aria-labelledby="trust-h"
      className={cx("border-t", dark ? "border-white/15 bg-deep text-paper on-dark" : "border-carbon bg-paper text-ink")}
    >
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
        <FieldLabel className={dark ? "text-purple-200" : "text-purple-600"}>
          Three things you can check in under a minute
        </FieldLabel>
        <h2 id="trust-h" className="mt-5 max-w-[24ch] text-[clamp(2rem,7vw,3.4rem)]">
          Without talking to me first.
        </h2>
        <p className={cx("mt-6 max-w-prose text-[1.05rem] leading-relaxed", dark ? "text-white/75" : "text-ink/75")}>
          I'm one person asking you to run your office on software I wrote. “Trust me” isn't an
          argument, so here are three things you can verify yourself instead.
        </p>

        <dl className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-3">
          {legs.map((l) => (
            <div key={l.n}>
              <div className={cx("pe-label tnum", dark ? "text-purple-200" : "text-purple-600")}>{l.n}</div>
              <dt className="pe-h3 mt-4 text-[1.32rem]">{l.h}</dt>
              <dd className={cx("mt-3 text-[0.98rem] leading-relaxed", dark ? "text-white/75" : "text-ink/75")}>
                {l.v}
              </dd>
            </div>
          ))}
        </dl>

        <Link
          to="/your-data"
          className={cx(
            "mt-10 inline-flex min-h-[48px] items-center border px-5 text-[0.95rem] font-medium transition-colors",
            dark
              ? "border-white/40 text-paper hover:bg-paper hover:text-ink"
              : "border-ink/25 text-ink hover:bg-ink hover:text-paper",
          )}
        >
          All three in full, including the bad news →
        </Link>
      </div>
    </section>
  );
}
