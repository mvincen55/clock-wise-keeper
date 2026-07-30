import type { ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── The signature element ───────────────────────────────────────────────────
   A perforated tear line. Square notches at each end, dashes across. */
export function Perforation({ className = "" }: { className?: string }) {
  return <div className={cx("pe-perf", className)} role="presentation" />;
}

/** Mono field label, as it reads on a real form. */
export function FieldLabel({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "span" | "h2" | "legend";
}) {
  return <As className={cx("pe-label text-purple-600", className)}>{children}</As>;
}

type ButtonProps = {
  children: ReactNode;
  /* `invert` and `outlineDark` exist so dark sections never need a color
     override via className — Tailwind resolves conflicting utilities by
     stylesheet order, not string order, so an override like
     "bg-white text-purple-700" can silently lose to the variant's
     "text-white" and produce white-on-white. */
  variant?: "primary" | "outline" | "ghost" | "invert" | "outlineDark";
  onClick?: () => void;
  href?: string;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export function Button({
  children,
  variant = "primary",
  onClick,
  href,
  type = "button",
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 px-5 min-h-[48px] text-[0.95rem] font-medium tracking-[-0.01em] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-purple-600 text-white hover:bg-purple-700",
    outline: "border border-ink/25 text-ink hover:bg-ink hover:text-paper",
    ghost: "text-ink/70 hover:text-ink underline decoration-carbon hover:decoration-purple-600 underline-offset-4",
    invert: "bg-white text-purple-700 hover:bg-purple-200 hover:text-purple-700",
    outlineDark: "border border-white/45 text-paper hover:bg-paper hover:text-ink",
  }[variant];

  if (href) {
    return (
      <a href={href} className={cx(base, styles, className)} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cx(base, styles, className)} {...rest}>
      {children}
    </button>
  );
}

/** Section wrapper. Consistent rhythm, generous on mobile first. */
export function Section({
  children,
  id,
  className = "",
  tone = "paper",
  label,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
  tone?: "paper" | "deep" | "purple" | "carbon";
  label?: string;
}) {
  const tones = {
    paper: "bg-paper text-ink border-t border-carbon",
    carbon: "bg-purple-50 text-ink border-t border-carbon",
    deep: "bg-deep text-paper on-dark",
    purple: "bg-purple-600 text-white on-dark",
  }[tone];
  return (
    <section id={id} aria-label={label} className={cx(tones, className)}>
      <div className="mx-auto w-full max-w-[1180px] px-5 py-16 sm:px-8 sm:py-24">{children}</div>
    </section>
  );
}

/** Honest status marker for demo panels. Factual, not apologetic. */
export function StatusChip({ status }: { status: "ships" | "building" }) {
  const isShipped = status === "ships";
  return (
    <span
      className={cx(
        "pe-label inline-flex shrink-0 items-center gap-1.5 border px-2 py-1",
        isShipped ? "border-purple-600/40 bg-purple-50 text-purple-700" : "border-ink/25 bg-transparent text-ink/60",
      )}
    >
      <span
        aria-hidden="true"
        className={cx("inline-block h-[7px] w-[7px]", isShipped ? "bg-purple-600" : "border border-ink/50 bg-transparent")}
      />
      {isShipped ? "In the product today" : "Designed, not built yet"}
    </span>
  );
}

/** A definition row — the k/v shape most of the content uses. */
export function Fact({
  k,
  v,
  tone = "light",
  className = "",
}: {
  k: string;
  v: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div className={cx("border-t pt-4", tone === "dark" ? "border-white/20" : "border-carbon", className)}>
      <dt className={cx("pe-h3 text-[1.08rem]", tone === "dark" ? "text-white" : "text-ink")}>{k}</dt>
      <dd className={cx("mt-2 text-[0.98rem] leading-relaxed", tone === "dark" ? "text-white/75" : "text-ink/75")}>
        {v}
      </dd>
    </div>
  );
}
