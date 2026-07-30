/**
 * The Y-fold envelope mark. Square corners throughout — the fold is a V from
 * the two top corners into the center, plus a stem dropping to the base edge,
 * which together read as a Y. Geometry only, no curves, no rounded joins.
 */
export function EnvelopeMark({
  size = 30,
  className = "",
  tone = "purple",
}: {
  size?: number;
  className?: string;
  tone?: "purple" | "paper";
}) {
  const body = tone === "purple" ? "#53406e" : "#FBFAFC";
  const fold = tone === "purple" ? "#FBFAFC" : "#53406e";
  return (
    <svg
      width={size}
      height={size * 0.72}
      viewBox="0 0 50 36"
      fill="none"
      shapeRendering="geometricPrecision"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0.9" y="0.9" width="48.2" height="34.2" fill={body} />
      <path d="M0.9 0.9 L25 19.6 L49.1 0.9" stroke={fold} strokeWidth="2.1" strokeLinecap="square" />
      <path d="M25 19.6 L25 35.1" stroke={fold} strokeWidth="2.1" strokeLinecap="square" />
    </svg>
  );
}

export function Logo({
  size = 30,
  tone = "purple",
  className = "",
}: {
  size?: number;
  tone?: "purple" | "paper";
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <EnvelopeMark size={size} tone={tone} />
      <span
        className="font-display text-[1.05rem] leading-none"
        style={{ letterSpacing: "-0.035em", fontStretch: "108%" }}
      >
        Purple Envelope
      </span>
    </span>
  );
}
