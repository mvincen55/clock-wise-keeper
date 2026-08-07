import { cn } from '@/lib/utils';

/**
 * The Purple Envelope mark: a hard-cornered envelope whose flap creases form a
 * Y. Purely decorative — no gradients, no rounding, no soft shadow. Sized by
 * the caller via className (it fills its box).
 */
export function EnvelopeMark({
  className,
  stroke = 3,
  filled = false,
}: {
  className?: string;
  /** Stroke width in the 0 0 120 84 viewBox. */
  stroke?: number;
  /** Draw the body as a solid field with the crease knocked out. */
  filled?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 120 84"
      className={cn('block', className)}
      fill="none"
      aria-hidden
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x={stroke / 2}
        y={stroke / 2}
        width={120 - stroke}
        height={84 - stroke}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={stroke}
      />
      <g
        stroke={filled ? 'var(--pe-knockout, #F7F5F1)' : 'currentColor'}
        strokeWidth={stroke}
        strokeLinecap="butt"
      >
        {/* the Y: two flap creases meeting a single spine */}
        <path d={`M ${stroke} ${stroke} L 60 46`} />
        <path d={`M ${120 - stroke} ${stroke} L 60 46`} />
        <path d={`M 60 46 L 60 ${84 - stroke}`} />
      </g>
    </svg>
  );
}

export default EnvelopeMark;
