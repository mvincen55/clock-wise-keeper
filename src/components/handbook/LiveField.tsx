import { useHandbookLiveValues } from '@/components/handbook/HandbookLiveContext';
import { describeLiveField, resolveLiveField, type LiveField as LiveFieldValue } from '@/lib/handbook-live-fields';

/** A price or policy number that follows the office's settings instead of the page. */
export default function LiveField({ field }: { field: LiveFieldValue }) {
  const values = useHandbookLiveValues();
  const live = resolveLiveField(field, values);
  if (live === null) return <>{field.fallback}</>;
  return <span className="handbook-live-value" title={describeLiveField(field)}>{live}</span>;
}
