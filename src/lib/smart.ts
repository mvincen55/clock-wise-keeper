// Live SMART evaluation for monthly goals.
//
// This runs entirely in the browser so the chips can update as the member
// types — no round trip, no waiting. Pathfinder's polish_goal always proposes
// a wording that satisfies all five, so the usual path is: type roughly,
// tap polish, save.
//
// Tone rule: a failing element is never an error. It is a plain hint.

export type SmartKey = 'specific' | 'measurable' | 'achievable' | 'relevant' | 'time_bound';

export type SmartCheck = {
  key: SmartKey;
  letter: string;
  label: string;
  ok: boolean;
  /** What the goal already does (when ok) or a plain nudge (when not). */
  note: string;
};

const LETTERS: Record<SmartKey, { letter: string; label: string }> = {
  specific: { letter: 'S', label: 'Specific' },
  measurable: { letter: 'M', label: 'Measurable' },
  achievable: { letter: 'A', label: 'Achievable' },
  relevant: { letter: 'R', label: 'Relevant' },
  time_bound: { letter: 'T', label: 'Time-bound' },
};

const NUMBER_WORDS =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|every|each)\b/i;

const TIME_HINTS =
  /\b(this month|by the end of the month|by month[- ]end|each week|every week|weekly|per week|each day|every day|daily|per shift|each shift|every shift|by (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

const CONTEXT_HINTS =
  /\b(patient|patients|team|teammate|office|practice|front desk|schedule|scheduling|hygiene|hygienist|insurance|treatment|recall|reappoint|chart|charting|doctor|operator|assistant|phone|call|check[- ]?in|check[- ]?out|claim|billing|collections|huddle|sterilization|op|ops)\b/i;

const OVERREACH = /\b(100%|perfect|perfectly|flawless|never (again|miss)|zero mistakes|always)\b/i;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

export function evaluateSmart(input: {
  title: string;
  target?: string | null;
  description?: string | null;
}): SmartCheck[] {
  const title = (input.title ?? '').trim();
  const target = (input.target ?? '').trim();
  const description = (input.description ?? '').trim();
  const all = `${title} ${target} ${description}`;

  const wordCount = words(title).length;
  const hasDigit = /\d/.test(`${title} ${target}`);
  const hasCount = hasDigit || NUMBER_WORDS.test(`${title} ${target}`);

  const specificOk = wordCount >= 6 && title.length >= 25;
  const measurableOk = hasCount && (target.length > 0 || /\d/.test(title));
  const achievableOk =
    measurableOk && wordCount <= 45 && !OVERREACH.test(all) && (title.match(/\band\b/gi) ?? []).length <= 2;
  const relevantOk = CONTEXT_HINTS.test(all) || description.length >= 25;
  const timeOk = TIME_HINTS.test(all);

  const make = (key: SmartKey, ok: boolean, yes: string, no: string): SmartCheck => ({
    key,
    ...LETTERS[key],
    ok,
    note: ok ? yes : no,
  });

  return [
    make(
      'specific',
      specificOk,
      'says clearly what you will do',
      'add a little more — what exactly will you do?'
    ),
    make(
      'measurable',
      measurableOk,
      target ? `measured by ${target}` : 'has a number you can count',
      'make it measurable — add a number or count'
    ),
    make(
      'achievable',
      achievableOk,
      'realistic for one month',
      measurableOk
        ? 'trim it a bit — one focused, doable thing beats an absolute'
        : 'add a modest number so it is clearly doable'
    ),
    make(
      'relevant',
      relevantOk,
      'connects to your role here',
      'tie it to your role — or add a line under “Why it matters”'
    ),
    make(
      'time_bound',
      timeOk,
      'bound to this month',
      'add a timeframe — e.g. “this month” or “each week”'
    ),
  ];
}

export const isSmart = (checks: SmartCheck[]) => checks.every(c => c.ok);
