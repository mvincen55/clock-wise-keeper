import { StatusChip, cx } from "@/components/Primitives";

/**
 * The honesty marker inside a panel. Used both for "this ships" and for
 * "this is designed and not built." Factual, no apology, no mood.
 */
export function DemoNote({
  k,
  v,
  status,
  className = "",
}: {
  k: string;
  v: string;
  status: string;
  className?: string;
}) {
  const s = status === "ships" ? "ships" : "building";
  return (
    <div
      className={cx(
        "border-l-2 bg-purple-50/70 p-4",
        s === "ships" ? "border-purple-600" : "border-ink/30",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="pe-h3 text-[1.02rem]">{k}</p>
        <StatusChip status={s} />
      </div>
      <p className="mt-2 text-[0.92rem] leading-relaxed text-ink/70">{v}</p>
    </div>
  );
}
