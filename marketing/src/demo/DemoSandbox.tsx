import { useRef, useState } from "react";
import { FieldLabel, StatusChip, cx } from "@/components/Primitives";
import { demo } from "@/content/site";
import { CloseoutPanel } from "./panels/Closeout";
import { DepositPanel } from "./panels/Deposit";
import { UpwardPanel } from "./panels/Upward";
import { EstimatePanel } from "./panels/Estimate";

const TABS = [
  { id: "closeout", label: demo.panels.closeout.tab, Panel: CloseoutPanel, status: "ships" as const },
  { id: "deposit", label: demo.panels.deposit.tab, Panel: DepositPanel, status: "ships" as const },
  { id: "upward", label: demo.panels.upward.tab, Panel: UpwardPanel, status: "ships" as const },
  { id: "estimate", label: demo.panels.estimate.tab, Panel: EstimatePanel, status: "ships" as const },
];

export function DemoSandbox() {
  const [active, setActive] = useState(0);
  /* Bumping the key remounts the panel, which is the whole reset mechanism —
     no shared store to unwind. */
  const [resetKey, setResetKey] = useState(0);
  const [resets, setResets] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const { Panel, status } = TABS[active];
  const resetLabel = demo.resetAgain[Math.min(resets, demo.resetAgain.length - 1)];

  function onKeyDown(e: React.KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (active + dir + TABS.length) % TABS.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="try" aria-labelledby="try-h" className="border-t border-carbon bg-purple-50/50">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">
        <FieldLabel>{demo.label}</FieldLabel>
        <h2 id="try-h" className="mt-5 max-w-[26ch] text-[clamp(2rem,7vw,3.4rem)]">
          {demo.h2}
        </h2>
        <p className="mt-6 max-w-prose text-[1.05rem] leading-relaxed text-ink/75">{demo.intro}</p>

        {/* Tabs. Horizontally scrollable on a phone, no wrapping mess. */}
        <div
          role="tablist"
          aria-label="Sandbox"
          onKeyDown={onKeyDown}
          className="mt-10 -mx-5 flex gap-px overflow-x-auto border-y border-carbon bg-carbon px-5 sm:mx-0 sm:px-0"
        >
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active === i}
              aria-controls={`panel-${t.id}`}
              tabIndex={active === i ? 0 : -1}
              onClick={() => setActive(i)}
              className={cx(
                "min-h-[52px] shrink-0 whitespace-nowrap px-4 text-[0.95rem] font-medium transition-colors",
                active === i ? "bg-purple-600 text-white" : "bg-paper text-ink/70 hover:bg-white hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${TABS[active].id}`}
          aria-labelledby={`tab-${TABS[active].id}`}
          className="pt-8"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <StatusChip status={status} />
            <button
              type="button"
              onClick={() => {
                setResetKey((k) => k + 1);
                setResets((r) => r + 1);
              }}
              className="min-h-[44px] text-[0.92rem] text-ink/60 underline decoration-carbon underline-offset-4 transition-colors hover:text-ink hover:decoration-purple-600"
            >
              {resetLabel}
            </button>
          </div>

          <Panel key={`${TABS[active].id}-${resetKey}`} />
        </div>
      </div>
    </section>
  );
}
