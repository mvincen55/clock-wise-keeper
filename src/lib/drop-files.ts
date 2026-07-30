/**
 * Pulling files out of a drop.
 *
 * People drag whatever is in front of them: five screenshots, or the whole
 * folder they saved them into. Both should just work — the panel treats
 * everything that lands as one report package.
 */

const MAX_DEPTH = 3;

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void;
  };
};

function fileOf(entry: FsEntry): Promise<File | null> {
  return new Promise(resolve => entry.file(f => resolve(f), () => resolve(null)));
}

/** readEntries hands back a page at a time; keep asking until it's empty. */
function readAll(entry: FsEntry): Promise<FsEntry[]> {
  const reader = entry.createReader();
  const out: FsEntry[] = [];
  return new Promise(resolve => {
    const step = () =>
      reader.readEntries(batch => {
        if (batch.length === 0) return resolve(out);
        out.push(...batch);
        step();
      }, () => resolve(out));
    step();
  });
}

async function walk(entry: FsEntry, depth: number, out: File[]): Promise<void> {
  if (entry.isFile) {
    const f = await fileOf(entry);
    if (f) out.push(f);
    return;
  }
  if (entry.isDirectory && depth < MAX_DEPTH) {
    for (const child of await readAll(entry)) await walk(child, depth + 1, out);
  }
}

/**
 * Every file in a drop, folders included. Falls back to the plain file list
 * when the browser doesn't expose directory entries.
 */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map(i => (i.kind === 'file' && 'webkitGetAsEntry' in i
      ? (i as DataTransferItem & { webkitGetAsEntry: () => FsEntry | null }).webkitGetAsEntry()
      : null))
    .filter((e): e is FsEntry => !!e);

  if (entries.length === 0) return Array.from(dt.files ?? []);

  const out: File[] = [];
  for (const e of entries) await walk(e, 0, out);
  return out.length > 0 ? out : Array.from(dt.files ?? []);
}
