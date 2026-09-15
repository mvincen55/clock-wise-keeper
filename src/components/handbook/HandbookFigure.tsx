import { useState, type ReactNode } from 'react';

/**
 * A picture in a handbook document. A file that has not been uploaded yet
 * (or was removed from the office's image library) leaves no broken frame
 * behind — the figure simply stays out of the page until the picture exists.
 */
export default function HandbookFigure({
  id,
  className,
  src,
  alt,
  caption,
}: {
  id?: string;
  className?: string;
  src: string;
  alt: string;
  caption?: ReactNode;
}) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <figure id={id} className={`${className ?? ''} handbook-figure`.trim()}>
      <img src={src} alt={alt} loading="lazy" onError={() => setMissing(true)} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
