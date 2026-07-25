import * as React from "react";
import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hideDateline?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hideDateline, onChange, value, ...props }, ref) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        internalRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
      },
      [ref]
    );

    const handleDateline = () => {
      const ta = internalRef.current;
      if (!ta) return;
      const dateline = `- - ${format(new Date(), "EEE MMM dd, yyyy")} - -`;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const before = ta.value.slice(0, start);
      const after = ta.value.slice(end);
      const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
      const newValue = `${before}${prefix}${dateline}${suffix}${after}`;

      // Use the native setter + React-compatible "input" event
      const nativeSet = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      if (nativeSet) {
        nativeSet.call(ta, newValue);
        ta.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Fallback: also fire onChange directly for controlled components
      if (onChange) {
        const syntheticEvent = {
          target: { ...ta, value: newValue },
          currentTarget: { ...ta, value: newValue },
        } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
        onChange(syntheticEvent);
      }

      requestAnimationFrame(() => {
        const cursorPos = before.length + prefix.length + dateline.length + suffix.length;
        ta.focus();
        ta.setSelectionRange(cursorPos, cursorPos);
      });
    };

    return (
      <div className="space-y-1">
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={setRefs}
          onChange={onChange}
          value={value}
          {...props}
        />
        {!hideDateline && !props.disabled && !props.readOnly && (
          <button
            type="button"
            onClick={handleDateline}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={`Insert dateline: - - ${format(new Date(), "EEE MMM dd, yyyy")} - -`}
          >
            <CalendarClock className="h-3 w-3" />
            Dateline
          </button>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
