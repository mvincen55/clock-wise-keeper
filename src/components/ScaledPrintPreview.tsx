import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Scales a fixed-width print sheet down to fit its container, so what a
 * screen shows is the paper itself rather than a second layout that can
 * drift from it. Shared by the FOF builder and the incident report.
 */
export default function ScaledPrintPreview({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      const available = outer.clientWidth;
      const natural = inner.scrollWidth;
      const scale = natural > 0 ? Math.min(1, available / natural) : 1;
      setLayout({ scale, height: inner.scrollHeight * scale });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full overflow-hidden">
      <div style={{ height: layout.height || undefined }}>
        <div
          ref={innerRef}
          style={{
            transform: `scale(${layout.scale})`,
            transformOrigin: 'top left',
            width: 'fit-content',
          }}
          className="border shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
