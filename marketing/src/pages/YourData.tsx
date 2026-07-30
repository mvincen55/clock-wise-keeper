import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Cta } from "@/components/Cta";
import { Fact, FieldLabel, Section, cx } from "@/components/Primitives";
import { yourData } from "@/content/site";

/**
 * A trust artifact. Nothing playful, no easter eggs, no motion beyond the
 * shared transition. Every claim here is checkable against the product.
 */
function ClaimList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "yes" | "no" | "promise";
}) {
  const marks = {
    yes: { border: "border-purple-600", chip: "bg-purple-600 text-white" },
    no: { border: "border-flag/60", chip: "bg-flag text-white" },
    promise: { border: "border-ink/30", chip: "bg-ink text-paper" },
  }[tone];

  return (
    <div className={cx("border-l-2 pl-5", marks.border)}>
      <p className={cx("pe-label inline-block px-2 py-1", marks.chip)}>{label}</p>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i} className="flex gap-3 text-[1rem] leading-relaxed text-ink/80">
            <span
              aria-hidden="true"
              className={cx(
                "mt-[9px] h-[6px] w-[6px] shrink-0",
                tone === "no" ? "bg-flag" : tone === "yes" ? "bg-purple-600" : "bg-ink/50",
              )}
            />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function YourDataPage() {
  return (
    <>
      <Nav />
      <main>
        <Section tone="paper" label="What you can verify">
          <FieldLabel>{yourData.eyebrow}</FieldLabel>
          <h1 className="mt-5 max-w-[26ch] text-[clamp(2.2rem,8vw,4rem)]">{yourData.h1}</h1>
          <p className="mt-7 max-w-prose text-[1.15rem] leading-relaxed text-ink/80">{yourData.intro}</p>
        </Section>

        {yourData.legs.map((leg, i) => (
          <Section
            key={leg.n}
            tone={i % 2 === 0 ? "carbon" : "paper"}
            label={leg.h}
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,7rem)_1fr] lg:gap-14">
              <div className="pe-num text-[clamp(3rem,10vw,5rem)] text-purple-600">
                {leg.n}
              </div>

              <div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <h2 className="text-[clamp(1.7rem,5.5vw,2.6rem)]">{leg.h}</h2>
                  {"status" in leg && leg.status && (
                    <span className="pe-label border border-flag px-2 py-1 text-flag">{leg.status}</span>
                  )}
                </div>

                <div className="mt-6 max-w-prose space-y-4 text-[1.05rem] leading-relaxed text-ink/80">
                  {leg.body.map((b) => (
                    <p key={b.slice(0, 24)}>{b}</p>
                  ))}
                </div>

                {/* Leg 03 splits into what works, what doesn't, and the promise. */}
                {"built" in leg && leg.built && (
                  <div className="mt-9 space-y-8">
                    <ClaimList label={leg.built.label} items={leg.built.items} tone="yes" />
                    <ClaimList label={leg.notBuilt!.label} items={leg.notBuilt!.items} tone="no" />
                    <ClaimList label={leg.promise!.label} items={leg.promise!.items} tone="promise" />
                  </div>
                )}

                <p className="mt-9 max-w-prose border-t border-carbon pt-5 text-[1rem] font-medium leading-relaxed">
                  {leg.check}
                </p>
              </div>
            </div>
          </Section>
        ))}

        {/* Aimed at the customer's protection, not the founder's character. */}
        <Section tone="deep" label="Acquisition risk">
          <FieldLabel className="text-purple-200">{yourData.antiDso.label}</FieldLabel>
          <h2 className="mt-5 max-w-[22ch] text-[clamp(2rem,7vw,3.4rem)]">{yourData.antiDso.h2}</h2>
          <div className="mt-7 max-w-prose space-y-5 text-[1.1rem] leading-relaxed text-white/85">
            {yourData.antiDso.body.map((b) => (
              <p key={b.slice(0, 24)}>{b}</p>
            ))}
          </div>
        </Section>

        <Section tone="paper" label="Why this is credible">
          <FieldLabel>{yourData.why.label}</FieldLabel>
          <dl className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {yourData.why.items.map((w) => (
              <Fact key={w.k} k={w.k} v={w.v} />
            ))}
          </dl>
        </Section>

        <Cta />
      </main>
      <Footer crossLink={{ to: "/", label: "The owner's version" }} />
    </>
  );
}
