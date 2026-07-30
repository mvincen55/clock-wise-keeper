import { useCallback, useEffect, useState } from 'react';
import { ALL_REDACTION_CATEGORIES, type RedactionCategories } from '@/lib/redact-image';

/**
 * What each person chooses to hide before a screenshot leaves their device.
 * Kept on the device — this is a personal privacy preference, not org data.
 */
const KEY = 'pe.support.redaction';

export const REDACTION_LABELS: Record<keyof RedactionCategories, string> = {
  names: 'Names',
  ids: 'IDs & long numbers',
  emails: 'Email addresses',
  datesTimes: 'Dates & times',
};

export function loadRedactionPrefs(): RedactionCategories {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...ALL_REDACTION_CATEGORIES };
    const parsed = JSON.parse(raw) as Partial<RedactionCategories>;
    return { ...ALL_REDACTION_CATEGORIES, ...parsed };
  } catch {
    return { ...ALL_REDACTION_CATEGORIES };
  }
}

export function useRedactionPrefs() {
  const [prefs, setPrefs] = useState<RedactionCategories>(() => loadRedactionPrefs());

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Private browsing — the choice just won't stick between visits.
    }
  }, [prefs]);

  const toggle = useCallback((key: keyof RedactionCategories, value: boolean) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }, []);

  return { prefs, setPrefs, toggle };
}

/** Short human summary of what's being covered, for the widget line. */
export function describeRedaction(prefs: RedactionCategories): string {
  const on = (Object.keys(REDACTION_LABELS) as (keyof RedactionCategories)[]).filter(
    k => prefs[k],
  );
  if (on.length === 0) return 'Nothing is being hidden';
  if (on.length === 4) return 'Hiding names, IDs, emails, dates & times';
  return `Hiding ${on.map(k => REDACTION_LABELS[k].toLowerCase()).join(', ')}`;
}
