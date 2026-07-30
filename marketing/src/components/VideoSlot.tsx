import { cx } from "./Primitives";

/**
 * An empty frame until a real file exists. No stock footage, no generated
 * content, no autoplaying placeholder — the label says what belongs here.
 */
export function VideoSlot({
  title,
  length,
  src,
  className = "",
  ratio = "16 / 9",
}: {
  title: string;
  length: string;
  src?: string;
  className?: string;
  ratio?: string;
}) {
  if (src) {
    return (
      <figure className={cx("border border-carbon bg-white", className)}>
        <video controls preload="metadata" className="block w-full" style={{ aspectRatio: ratio }} src={src} />
        <figcaption className="flex items-baseline justify-between gap-3 border-t border-carbon px-4 py-3">
          <span className="text-[0.95rem] text-ink/80">{title}</span>
          <span className="pe-label tnum text-ink/45">{length}</span>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className={cx("border border-dashed border-ink/25 bg-white", className)}>
      <div
        className="flex items-center justify-center bg-purple-50/60 px-4"
        style={{ aspectRatio: ratio }}
      >
        <div className="text-center">
          {/* A play triangle, square-cornered like everything else. */}
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true" className="mx-auto">
            <path d="M11 7 L27 17 L11 27 Z" fill="none" stroke="#53406e" strokeWidth="1.6" />
          </svg>
          <p className="pe-label mt-3 text-purple-600">Video slot</p>
        </div>
      </div>
      <figcaption className="border-t border-dashed border-ink/25 px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[0.95rem] text-ink/80">{title}</span>
          <span className="pe-label tnum text-ink/45">{length}</span>
        </div>
        <p className="mt-1.5 text-[0.85rem] text-ink/50">TODO(megan): record this one.</p>
      </figcaption>
    </figure>
  );
}
