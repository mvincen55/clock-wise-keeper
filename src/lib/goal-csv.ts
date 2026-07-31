// CSV → goals + steps. Small, dependency-free parser (RFC-4180-ish: quotes, escaped quotes, CRLF).

export type ParsedGoalRow = {
  line: number;
  owner: string;
  title: string;
  target: string;
  month: string;
  visibility: 'team' | 'private';
  step: string;
  stepDue: string | null;
};

export type PlannedStep = { title: string; due_date: string | null; line: number };

export type PlannedGoal = {
  key: string;
  owner: string;
  ownerUserId: string | null;
  title: string;
  target: string;
  month: string;
  visibility: 'team' | 'private';
  steps: PlannedStep[];
  problems: string[];
};

export type ParseResult = {
  goals: PlannedGoal[];
  errors: { line: number; message: string }[];
};

export const GOAL_CSV_TEMPLATE = [
  'owner,goal,target,month,visibility,step,step_due',
  'Jane Smith,Faster morning huddle,Huddle done by 8:10 on 18 of 20 days,2026-08,team,Print the day sheet the night before,2026-08-05',
  'Jane Smith,Faster morning huddle,Huddle done by 8:10 on 18 of 20 days,2026-08,team,Move supply talk to Fridays,2026-08-12',
  'Alex Ruiz,Recall follow-ups,25 recall calls made,2026-08,team,Block 20 minutes daily for calls,',
].join('\n');

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

const HEADER_ALIASES: Record<string, string> = {
  owner: 'owner',
  'owner name': 'owner',
  member: 'owner',
  'team member': 'owner',
  who: 'owner',
  goal: 'title',
  'goal title': 'title',
  title: 'title',
  target: 'target',
  'smart target': 'target',
  measure: 'target',
  measurable: 'target',
  month: 'month',
  visibility: 'visibility',
  step: 'step',
  'step title': 'step',
  task: 'step',
  step_due: 'step_due',
  'step due': 'step_due',
  due: 'step_due',
  'due date': 'step_due',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts YYYY-MM-DD or M/D/YYYY. Returns ISO date or null. */
export function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (DATE_RE.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

export function normalizeMonth(raw: string, fallback: string): string {
  const v = raw.trim();
  if (/^\d{4}-\d{2}$/.test(v)) return v;
  const iso = normalizeDate(v);
  if (iso) return iso.slice(0, 7);
  return fallback;
}

/**
 * Map CSV text to planned goals. Rows sharing owner + goal title + month
 * are merged into one goal with many steps.
 */
export function planGoalsFromCsv(
  text: string,
  opts: {
    defaultMonth: string;
    /** display name (lowercased) → user_id */
    people: { user_id: string; display_name: string }[];
    /** Used when the owner cell is blank. */
    selfUserId: string;
    selfName: string;
  }
): ParseResult {
  const errors: { line: number; message: string }[] = [];
  const rows = parseCsv(text);
  if (rows.length === 0) return { goals: [], errors: [{ line: 0, message: 'The file is empty.' }] };

  const header = rows[0].map(h => HEADER_ALIASES[h.trim().toLowerCase()] ?? h.trim().toLowerCase());
  if (!header.includes('title')) {
    return {
      goals: [],
      errors: [{ line: 1, message: 'Missing a "goal" column in the header row.' }],
    };
  }
  const idx = (name: string) => header.indexOf(name);

  const byName = new Map(opts.people.map(p => [p.display_name.trim().toLowerCase(), p.user_id]));
  const goals = new Map<string, PlannedGoal>();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const line = r + 1;
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? (cells[i] ?? '').trim() : '';
    };

    const title = get('title');
    if (!title) {
      errors.push({ line, message: 'No goal title — row skipped.' });
      continue;
    }
    const ownerRaw = get('owner');
    const owner = ownerRaw || opts.selfName;
    const ownerUserId = ownerRaw ? (byName.get(ownerRaw.toLowerCase()) ?? null) : opts.selfUserId;
    const month = normalizeMonth(get('month'), opts.defaultMonth);
    const visibility = get('visibility').toLowerCase() === 'private' ? 'private' : 'team';
    const target = get('target');
    const key = `${(ownerUserId ?? owner.toLowerCase())}|${title.toLowerCase()}|${month}`;

    let goal = goals.get(key);
    if (!goal) {
      goal = {
        key,
        owner,
        ownerUserId,
        title,
        target,
        month,
        visibility,
        steps: [],
        problems: [],
      };
      if (!ownerUserId) goal.problems.push(`No active team member named "${owner}".`);
      if (!target.trim()) goal.problems.push('Missing a measurable target.');
      goals.set(key, goal);
    } else if (!goal.target && target) {
      goal.target = target;
      goal.problems = goal.problems.filter(p => p !== 'Missing a measurable target.');
    }

    const step = get('step');
    if (step) {
      const dueRaw = get('step_due');
      const due = normalizeDate(dueRaw);
      if (dueRaw && !due) {
        errors.push({ line, message: `Could not read the due date "${dueRaw}" — left blank.` });
      }
      goal.steps.push({ title: step, due_date: due, line });
    }
  }

  return { goals: [...goals.values()], errors };
}
