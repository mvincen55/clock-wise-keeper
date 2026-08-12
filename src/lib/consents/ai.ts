import { supabase } from '@/integrations/supabase/client';
import {
  cleanupConvertedContent, heuristicConvert, sanitizeBlocks, sanitizeCategory, guessCategory,
} from './convert';
import type { ConsentTemplateContent, FormCategory } from './types';

/** Template content as plain text, for AI review modes and version compare. */
export function contentToPlainText(content: ConsentTemplateContent): string {
  return content.blocks
    .map(block => {
      const bits = [block.label, block.body, ...(block.items ?? [])].filter(Boolean);
      return bits.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Client for the consent-ai edge function, with an honest local fallback.
 *
 * The function operates on the office's own template wording only — nothing
 * from the Complete Forms workflow (patient fills) ever routes through here.
 * When the function is unreachable (not yet deployed, offline), conversion
 * falls back to the local heuristic converter so the upload flow still
 * produces a reviewable draft, clearly labeled as a basic conversion.
 */

export interface ConversionResult {
  content: ConsentTemplateContent;
  category: FormCategory;
  /** 'ai' when the model produced it; 'basic' for the local fallback. */
  engine: 'ai' | 'basic';
  notice?: string;
}

export async function convertUploadedForm(name: string, text: string): Promise<ConversionResult> {
  try {
    const { data, error } = await supabase.functions.invoke('consent-ai', {
      body: { action: 'convert', name, text },
    });
    if (error) throw error;
    const raw = (data as { result?: { category?: unknown; blocks?: unknown } })?.result;
    const content = cleanupConvertedContent(sanitizeBlocks(raw?.blocks ?? raw));
    if (content.blocks.length === 0) throw new Error('empty conversion');
    return {
      content,
      category: sanitizeCategory(raw?.category),
      engine: 'ai',
    };
  } catch {
    // Not deployed / offline / bad output — the office still gets a working
    // draft from the local converter, and the review screen says which
    // engine produced it.
    return {
      content: cleanupConvertedContent(heuristicConvert(name, text)),
      category: guessCategory(name, text),
      engine: 'basic',
      notice:
        'AI conversion was unavailable, so this draft came from the basic local converter. ' +
        'You can re-run the AI conversion later from the review screen.',
    };
  }
}

export type AssistMode =
  | 'rewrite'
  | 'simplify'
  | 'professional'
  | 'missing_risks'
  | 'unclear'
  | 'suggest_sections'
  | 'compare'
  | 'warmer'
  | 'shorten'
  | 'grammar'
  | 'draft_section';

export const ASSIST_MODE_LABELS: Record<AssistMode, string> = {
  rewrite: 'Rewrite for patient understanding',
  simplify: 'Simplify language',
  professional: 'Make more professional',
  missing_risks: 'Identify missing risks',
  unclear: 'Identify unclear wording',
  suggest_sections: 'Suggest common sections',
  compare: 'Compare two versions',
  warmer: 'Make it warmer and easier for patients',
  shorten: 'Shorten the form',
  grammar: 'Improve grammar and organization',
  draft_section: 'Draft a new section',
};

/**
 * Drafting help for managers. Returns suggestion text only — callers show
 * it beside the current wording and the manager decides what to apply.
 * AI output NEVER overwrites office-approved language automatically.
 */
export async function consentAssist(
  mode: AssistMode,
  text: string,
  otherText?: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('consent-ai', {
    body: { action: 'assist', mode, text, otherText },
  });
  if (error) {
    throw new Error(
      'AI drafting help is unavailable right now. The consent-ai function may not be deployed yet.',
    );
  }
  const result = (data as { result?: string })?.result;
  if (!result) throw new Error('No suggestion came back — try again.');
  return result;
}

// ---------------------------------------------------------------------------
// Review-based workflow (the builder's "Improve this form with AI" panel)
// ---------------------------------------------------------------------------

/** What the manager wants help with — step 1 of the panel. */
export type AssistGoal =
  | 'simplify'
  | 'warmer'
  | 'missing_info'
  | 'shorten'
  | 'grammar'
  | 'draft_section';

export const ASSIST_GOALS: AssistGoal[] = [
  'simplify', 'warmer', 'missing_info', 'shorten', 'grammar', 'draft_section',
];

export const ASSIST_GOAL_LABELS: Record<AssistGoal, string> = {
  simplify: 'Simplify language',
  warmer: 'Make it warmer and easier for patients',
  missing_info: 'Check for missing consent information',
  shorten: 'Shorten the form',
  grammar: 'Improve grammar and organization',
  draft_section: 'Draft a new section',
};

/** What text goes to the AI — step 2 of the panel. */
export type AssistScope = 'selection' | 'page' | 'form';

export const ASSIST_SCOPE_LABELS: Record<AssistScope, string> = {
  selection: 'Selected section',
  page: 'Current page',
  form: 'Entire form',
};

/** One structured suggestion: quoted passage, replacement, and why. */
export interface ReviewItem {
  original: string;
  suggested: string;
  reason: string;
}

/** Label for the panel's action button, so it says what will happen. */
export function actionLabelFor(goal: AssistGoal, scope: AssistScope): string {
  if (goal === 'missing_info') return 'Review form';
  if (goal === 'draft_section') return 'Draft section';
  if (scope === 'selection') return 'Rewrite selected section';
  return 'Generate suggestions';
}

/**
 * Structured review of template wording. Returns suggestion items only —
 * the panel shows original vs suggested and the manager accepts, edits, or
 * dismisses each one. Nothing is ever applied automatically.
 */
export async function reviewForm(
  goal: AssistGoal,
  scopeLabel: string,
  text: string,
): Promise<ReviewItem[]> {
  const { data, error } = await supabase.functions.invoke('consent-ai', {
    body: { action: 'review', goal, scope_label: scopeLabel, text },
  });
  if (error) {
    // Non-2xx responses carry a clear message (e.g. an unreadable AI reply
    // 502s) — show that instead of a generic "unavailable".
    let message = 'AI review is unavailable right now. The consent-ai function may not be deployed yet.';
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const body = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) message = body.error;
    }
    throw new Error(message);
  }
  const raw = (data as { items?: unknown; error?: string }) ?? {};
  if (!Array.isArray(raw.items)) {
    throw new Error(raw.error || 'The review came back unreadable — try again.');
  }
  // The function already validates shape; this keeps a misbehaving deploy
  // from feeding the panel unusable cards.
  return raw.items.filter(
    (item): item is ReviewItem =>
      !!item &&
      typeof (item as ReviewItem).original === 'string' &&
      typeof (item as ReviewItem).suggested === 'string' &&
      typeof (item as ReviewItem).reason === 'string',
  );
}
