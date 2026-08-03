// Practice Pulse — the orb's state, derived only from recorded vitals.
//
// Calm on purpose: a breathing dot, never a scoreboard. The state is a pure
// function so the visual can never disagree with the numbers behind it.

export type PulseState = 'strong' | 'steady' | 'watch' | 'quiet';

export type PulseInput = {
  /** Production recorded so far this month, in cents. */
  productionCents: number;
  /** What "on pace" looks like right now, in cents (last month, same slice). */
  pacedTargetCents: number;
  /** Schedule disruptions (cancellations + no-shows) so far this month. */
  disruptions: number;
  /** Disruptions expected by this point in a normal month. */
  disruptionBaseline: number;
};

export type Pulse = {
  state: PulseState;
  /** Production as a fraction of pace. Null when there's nothing to compare. */
  pace: number | null;
  /** Seconds per breath — calm states breathe slower. */
  breathSeconds: number;
  label: string;
  /** The receipt: why the orb looks the way it does. */
  detail: string;
};

const BREATH: Record<PulseState, number> = {
  strong: 4.5,
  steady: 5.5,
  watch: 3.5,
  quiet: 8,
};

const LABEL: Record<PulseState, string> = {
  strong: 'Running strong',
  steady: 'Steady',
  watch: 'Worth a look',
  quiet: 'Quiet',
};

/** Disruptions are "elevated" once they run a quarter above the usual pace. */
const DISRUPTION_TOLERANCE = 1.25;

export function practicePulse(input: PulseInput): Pulse {
  const { productionCents, pacedTargetCents, disruptions, disruptionBaseline } = input;

  // Nothing recorded yet — say so plainly rather than inventing a verdict.
  if (pacedTargetCents <= 0 && productionCents <= 0) {
    return {
      state: 'quiet',
      pace: null,
      breathSeconds: BREATH.quiet,
      label: LABEL.quiet,
      detail: 'No production logged yet this month.',
    };
  }

  const pace = pacedTargetCents > 0 ? productionCents / pacedTargetCents : null;
  const disruptionsElevated =
    disruptionBaseline > 0 && disruptions > disruptionBaseline * DISRUPTION_TOLERANCE;

  let state: PulseState;
  if (pace === null) {
    // Production exists but there's no comparison month yet.
    state = disruptionsElevated ? 'watch' : 'steady';
  } else if (pace < 0.9 || disruptionsElevated) {
    state = 'watch';
  } else if (pace >= 1.05) {
    state = 'strong';
  } else {
    state = 'steady';
  }

  const pacePart =
    pace === null
      ? 'No comparison month yet'
      : `Production at ${Math.round(pace * 100)}% of pace`;
  const disruptionPart = disruptionsElevated
    ? `, disruptions above usual (${disruptions} vs ~${Math.round(disruptionBaseline)})`
    : '';

  return {
    state,
    pace,
    breathSeconds: BREATH[state],
    label: LABEL[state],
    detail: `${pacePart}${disruptionPart}.`,
  };
}
