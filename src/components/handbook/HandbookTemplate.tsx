import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * A verbatim template from the handbook (a fenced block), with its line
 * breaks intact and a one-click copy, for text that staff paste elsewhere:
 * insurance notes in the practice management system, chart notes, scripts.
 */
export default function HandbookTemplate({ id, className = '', text }: { id?: string; className?: string; text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div id={id} className={`${className} handbook-template`}>
      <div className="handbook-template-bar">
        <span>Template</span>
        <button type="button" onClick={copy} aria-live="polite">
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
