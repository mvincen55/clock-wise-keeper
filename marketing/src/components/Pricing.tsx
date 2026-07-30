import { FieldLabel, Perforation, cx } from "./Primitives";
import { pricing } from "@/content/site";

/**
 * No gate, no email, no click-through. The awkward numbers sit directly
 * under the price on the same screen, not on a separate page.
 * Nothing playful anywhere in this component.
 */
export function Pricing() {
  return (
    <section id="price" aria-labelledby="price-h" className="border-t border-carbon bg-purple-50">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
        <FieldLabel>Price</FieldLabel>
        <h2 id="price-h" className="mt-5 max-w-[26ch] text-[clamp(2rem,7vw,3.4rem)]">
          It's on the page. That's the whole point.
        </h2>
        <p className="mt-6 max-w-prose text-[1.05rem] leading-relaxed text-ink/75">
          One price for the whole office. Everyone at the practice is included — there is no
          per-person charge and no seat count to argue about. Month to month, cancel any month.
        </p>

        <div className="mt-12 grid gap-px border border-carbon bg-carbon sm:grid-cols-3">
          {pricing.tiers.map((t) => (
            <div
              key={t.name}
              className={cx(
                "flex flex-col bg-white p-6 sm:p-7",
                t.emphasis && "outline outline-2 -outline-offset-2 outline-purple-600",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>{t.name}</FieldLabel>
                {t.emphasis && <span className="pe-label text-ink/45">Most offices</span>}
              </div>

              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="pe-num text-[3.2rem]">${t.price}</span>
              </p>
              <p className="pe-label mt-2 text-ink/50">{pricing.unit}</p>

              <p className="mt-5 text-[0.95rem] leading-relaxed text-ink/70">{t.who}</p>

              <ul className="mt-6 space-y-2.5 border-t border-carbon pt-5">
                {t.includes.map((i) => (
                  <li key={i} className="flex gap-2.5 text-[0.95rem] leading-relaxed text-ink/80">
                    <span aria-hidden="true" className="mt-[8px] h-[6px] w-[6px] shrink-0 bg-purple-600" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* The unpleasant numbers. Same screen as the price, deliberately. */}
        <div className="mt-10 border border-ink/20 bg-white">
          <div className="p-6 sm:p-8">
            <FieldLabel>{pricing.unpleasant.label}</FieldLabel>
            <dl className="mt-6 grid gap-6 sm:grid-cols-2">
              {pricing.unpleasant.items.map((u) => (
                <div key={u.k} className="border-t border-carbon pt-4">
                  <dt className="pe-h3 text-[1.04rem]">{u.k}</dt>
                  <dd className="mt-2 text-[0.95rem] leading-relaxed text-ink/70">{u.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <Perforation />
          <p className="p-6 text-[0.95rem] leading-relaxed text-ink/70 sm:p-8">
            A price with the bad parts hidden underneath it is worse than no price at all. If any of
            the above is a dealbreaker, you've saved us both a call.
          </p>
        </div>
      </div>
    </section>
  );
}
