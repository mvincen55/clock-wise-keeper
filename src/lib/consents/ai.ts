import { supabase } from '@/integrations/supabase/client';
import { heuristicConvert, sanitizeBlocks, sanitizeCategory, guessCategory } from './convert';
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
    const content = sanitizeBlocks(raw?.blocks ?? raw);
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
      content: heuristicConvert(name, text),
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
  | 'compare';

export const ASSIST_MODE_LABELS: Record<AssistMode, string> = {
  rewrite: 'Rewrite for patient understanding',
  simplify: 'Simplify language',
  professional: 'Make more professional',
  missing_risks: 'Identify missing risks',
  unclear: 'Identify unclear wording',
  suggest_sections: 'Suggest common sections',
  compare: 'Compare two versions',
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
