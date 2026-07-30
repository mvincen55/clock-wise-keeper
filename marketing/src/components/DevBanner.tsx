import { useState } from "react";
import { PUBLISH_BLOCKERS } from "@/content/site";

/**
 * Visible in `npm run dev` only — never in a production build, because Vite
 * dead-code-eliminates this whole component behind import.meta.env.DEV.
 * It exists so no TODO can be forgotten between here and publish.
 */
export function DevBanner() {
  const [open, setOpen] = useState(false);
  if (!import.meta.env.DEV) return null;

  const blockers = PUBLISH_BLOCKERS.filter((b) => b.severity === "blocker");
  const checks = PUBLISH_BLOCKERS.filter((b) => b.severity !== "blocker");

  return (
    <div className="fixed bottom-0 left-0 z-50 max-h-[70vh] w-full overflow-auto border-t-2 border-flag bg-white text-left sm:max-w-md sm:border-r-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <span className="pe-label bg-flag px-1.5 py-0.5 text-white">Dev only</span>
        <span className="text-[0.9rem] font-medium">
          {blockers.length} blockers · {checks.length} to confirm
        </span>
        <span aria-hidden="true" className="ml-auto text-ink/50">
          {open ? "▾" : "▴"}
        </span>
      </button>
      {open && (
        <ol className="border-t border-carbon px-4 py-3">
          {[...blockers, ...checks].map((b) => (
            <li key={b.n} className="border-b border-carbon py-3 last:border-0">
              <div className="flex items-baseline gap-2">
                <span className="pe-label tnum text-ink/40">{String(b.n).padStart(2, "0")}</span>
                <span className="text-[0.92rem] font-semibold">{b.title}</span>
                {b.severity === "blocker" && <span className="pe-label ml-auto text-flag">blocker</span>}
              </div>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-ink/65">{b.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
