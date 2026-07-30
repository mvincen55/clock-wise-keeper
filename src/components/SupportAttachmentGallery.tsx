import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Maximize2,
  PenLine,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export type GalleryItem = {
  key: string;
  /** The file as picked. */
  original: File;
  /** What actually gets sent (scrubbed copy when redaction is on). */
  shown: File;
  working: boolean;
  uploadedPath?: string | null;
  uploadError?: string | null;
};

type Props = {
  items: GalleryItem[];
  maxFiles: number;
  onRemove: (key: string) => void;
  onRemoveAll: () => void;
  onReplace: (key: string, file: File) => void;
  onAdd: (files: File[]) => void;
  onEditMasks?: (key: string) => void;
};

function prettySize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Object URLs, created once per file and cleaned up on change. */
function usePreviewUrls(items: GalleryItem[]) {
  const cache = useRef(new Map<string, { file: File; url: string }>());
  const urls = useMemo(() => {
    const map: Record<string, string | null> = {};
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.key);
      if (!it.shown.type.startsWith('image/')) {
        map[it.key] = null;
        continue;
      }
      const hit = cache.current.get(it.key);
      if (hit && hit.file === it.shown) {
        map[it.key] = hit.url;
      } else {
        if (hit) URL.revokeObjectURL(hit.url);
        const url = URL.createObjectURL(it.shown);
        cache.current.set(it.key, { file: it.shown, url });
        map[it.key] = url;
      }
    }
    for (const [key, val] of cache.current) {
      if (!seen.has(key)) {
        URL.revokeObjectURL(val.url);
        cache.current.delete(key);
      }
    }
    return map;
  }, [items]);

  const cacheRef = cache;
  useEffect(
    () => () => {
      for (const val of cacheRef.current.values()) URL.revokeObjectURL(val.url);
      cacheRef.current.clear();
    },
    [cacheRef],
  );

  return urls;
}

/**
 * Preview gallery for the files attached to a support report — look at each
 * one, swap a bad screenshot for a better one, or drop it before sending.
 */
export function SupportAttachmentGallery({
  items,
  maxFiles,
  onRemove,
  onRemoveAll,
  onReplace,
  onAdd,
  onEditMasks,
}: Props) {
  const urls = usePreviewUrls(items);
  const [zoomKey, setZoomKey] = useState<string | null>(null);
  const replaceKey = useRef<string | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const addInput = useRef<HTMLInputElement | null>(null);

  if (items.length === 0) return null;

  const zoomed = items.find(i => i.key === zoomKey) ?? null;
  const room = Math.max(0, maxFiles - items.length);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground">
          {items.length} file{items.length === 1 ? '' : 's'} attached — they go over as one report
          package.
        </p>
        <button
          type="button"
          onClick={onRemoveAll}
          className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Remove all
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {items.map(a => {
          const url = urls[a.key];
          return (
            <div
              key={a.key}
              className={`overflow-hidden rounded-md border bg-muted/40 ${
                a.uploadError ? 'border-destructive' : 'border-border/60'
              }`}
            >
              <div className="relative h-20 w-full bg-muted">
                {url ? (
                  <img
                    src={url}
                    alt={`Attachment preview: ${a.original.name}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted-foreground">
                    {a.original.name}
                  </span>
                )}

                {a.working && (
                  <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </span>
                )}

                {url && !a.working && (
                  <button
                    type="button"
                    onClick={() => setZoomKey(a.key)}
                    aria-label={`Open larger preview of ${a.original.name}`}
                    title="See it bigger"
                    className="absolute bottom-0 left-0 rounded-tr bg-background/90 p-0.5"
                  >
                    <Maximize2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}

                {a.uploadedPath && !a.working && (
                  <span
                    className="absolute bottom-0 right-0 rounded-tl bg-background/90 p-0.5"
                    title="Already uploaded"
                  >
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                  </span>
                )}
                {a.uploadError && !a.working && (
                  <span
                    className="absolute bottom-0 right-0 rounded-tl bg-background/90 p-0.5"
                    title={a.uploadError}
                  >
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => onRemove(a.key)}
                  aria-label={`Remove ${a.original.name}`}
                  title="Remove"
                  className="absolute right-0 top-0 rounded-bl bg-background/90 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-1 p-1.5">
                <p className="truncate text-[10px] font-medium text-foreground" title={a.original.name}>
                  {a.original.name}
                </p>
                <p className="text-[9px] text-muted-foreground">{prettySize(a.original.size)}</p>
                {a.uploadError && (
                  <p className="text-[9px] leading-tight text-destructive">{a.uploadError}</p>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      replaceKey.current = a.key;
                      replaceInput.current?.click();
                    }}
                    className="flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground"
                    aria-label={`Replace ${a.original.name}`}
                    title="Swap in a different file"
                  >
                    <RefreshCw className="h-2.5 w-2.5" /> Replace
                  </button>
                  {onEditMasks &&
                    a.original.type.startsWith('image/') &&
                    !a.working &&
                    !a.uploadedPath && (
                      <button
                        type="button"
                        onClick={() => onEditMasks(a.key)}
                        className="ml-auto flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-foreground"
                        aria-label={`Draw masks on ${a.original.name}`}
                        title="Cover something yourself"
                      >
                        <PenLine className="h-2.5 w-2.5" /> Cover
                      </button>
                    )}
                </div>
              </div>
            </div>
          );
        })}

        {room > 0 && (
          <button
            type="button"
            onClick={() => addInput.current?.click()}
            className="flex h-full min-h-[6.5rem] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/70 text-[10px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add more
            <span className="text-[9px]">{room} left</span>
          </button>
        )}
      </div>

      <input
        ref={replaceInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          const key = replaceKey.current;
          if (f && key) onReplace(key, f);
          replaceKey.current = null;
          e.target.value = '';
        }}
      />
      <input
        ref={addInput}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={e => {
          onAdd(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <Dialog open={!!zoomed} onOpenChange={o => !o && setZoomKey(null)}>
        <DialogContent className="z-[70] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="truncate text-sm">
              {zoomed?.original.name ?? 'Preview'}
            </DialogTitle>
          </DialogHeader>
          {zoomed && urls[zoomed.key] && (
            <img
              src={urls[zoomed.key] as string}
              alt={`Full preview: ${zoomed.original.name}`}
              className="max-h-[70vh] w-full rounded border object-contain"
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            This is exactly what gets sent with your report.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (zoomed) {
                  replaceKey.current = zoomed.key;
                  replaceInput.current?.click();
                  setZoomKey(null);
                }
              }}
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Replace
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (zoomed) onRemove(zoomed.key);
                setZoomKey(null);
              }}
            >
              <X className="mr-1 h-3 w-3" /> Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SupportAttachmentGallery;
