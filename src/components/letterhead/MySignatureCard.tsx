import { useEffect, useRef, useState } from 'react';
import { Eraser, Loader2, PenLine, RefreshCw, Trash2, Upload, Wand2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import SignaturePadCanvas, {
  type SignaturePadHandle,
} from '@/components/signature/SignaturePadCanvas';
import {
  useMySignature,
  useRemoveMySignature,
  useSaveMySignature,
  useSetAllowOfficeUse,
  useSignatureImage,
} from '@/hooks/useStaffSignature';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useMyProfile';
import {
  normalizeSignatureImage,
  validateSignatureUpload,
} from '@/lib/letters/signature-image';
import {
  generateSignatureOptions,
  renderSignatureOption,
} from '@/lib/letters/signature-generate';

/**
 * My Signature — self-service management of the signed-in staff member's
 * stored signature (draw, upload, or "Create one for me" — a set of
 * generated handwritten-style options built from the person's OWN display
 * name; preview, replace, remove, and the "teammates may print it"
 * authorization). This is office/business configuration about the STAFF
 * MEMBER THEMSELVES — the polar opposite of patient consent signatures,
 * which stay memory-only in Complete Forms. RLS binds every write here to
 * the authenticated user; a manager cannot open this card and change or
 * generate someone else's ink.
 */

interface GeneratedPreview {
  url: string;
  blob: Blob;
}

export default function MySignatureCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: meta, isLoading } = useMySignature();
  const { data: myProfile } = useMyProfile();
  const { data: imageUrl } = useSignatureImage(meta ? user?.id : null);
  const save = useSaveMySignature();
  const remove = useRemoveMySignature();
  const setAllow = useSetAllowOfficeUse();

  const [mode, setMode] = useState<'view' | 'draw' | 'upload' | 'generate'>('view');
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<{ url: string; blob: Blob } | null>(null);
  const [busy, setBusy] = useState(false);
  const padRef = useRef<SignaturePadHandle | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // "Create one for me": generated from MY display name only, seeded so
  // "New options" produces a fresh set.
  const [genSeed, setGenSeed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const [genOptions, setGenOptions] = useState<GeneratedPreview[]>([]);
  const [genSelected, setGenSelected] = useState<number | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const myName = myProfile?.fullName.trim() ?? '';

  useEffect(() => {
    if (mode !== 'generate' || myName === '') return;
    let cancelled = false;
    setGenBusy(true);
    setGenSelected(null);
    (async () => {
      const previews: GeneratedPreview[] = [];
      for (const option of generateSignatureOptions(myName, genSeed, 5)) {
        const canvas = await renderSignatureOption(option);
        if (!canvas) continue;
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png'));
        if (blob) previews.push({ url: URL.createObjectURL(blob), blob });
      }
      if (!cancelled) {
        setGenOptions(prev => {
          prev.forEach(p => URL.revokeObjectURL(p.url));
          return previews;
        });
        setGenBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, genSeed, myName]);

  const finishSave = async (png: Blob) => {
    await save.mutateAsync(png);
    setMode('view');
    setDrawnDataUrl(null);
    setUploadPreview(null);
    toast({ title: 'Signature saved', description: 'Letters can now carry your real signature.' });
  };

  const saveDrawn = async () => {
    if (!drawnDataUrl) return;
    setBusy(true);
    try {
      const source = await (await fetch(drawnDataUrl)).blob();
      const normalized = await normalizeSignatureImage(source);
      if (!normalized) {
        toast({ title: 'Nothing to save', description: 'Draw your signature first.', variant: 'destructive' });
        return;
      }
      await finishSave(normalized);
    } catch {
      toast({ title: 'Could not save the signature', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateSignatureUpload(file);
    if (problem) {
      toast({ title: "Can't use that file", description: problem, variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const normalized = await normalizeSignatureImage(file);
      if (!normalized) {
        toast({
          title: 'No signature found',
          description: 'The image looks blank — try a clearer photo or scan.',
          variant: 'destructive',
        });
        return;
      }
      setUploadPreview({ url: URL.createObjectURL(normalized), blob: normalized });
    } catch {
      toast({ title: 'Could not read that image', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const saveGenerated = async () => {
    if (genSelected === null || !genOptions[genSelected]) return;
    setBusy(true);
    try {
      // Same treatment as Draw/Upload: crop + bound via the normalizer so
      // every stored signature shares one visual footprint.
      const normalized = await normalizeSignatureImage(genOptions[genSelected].blob);
      if (!normalized) {
        toast({ title: 'Could not prepare that signature', variant: 'destructive' });
        return;
      }
      await finishSave(normalized);
    } catch {
      toast({ title: 'Could not save the signature', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const working = busy || save.isPending || remove.isPending;

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5 text-primary" />
          My Signature
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Store your real signature once and office letters and notes can carry it as ink above
          your typed name. It's saved privately for this office — only you can change or remove it.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : mode === 'view' ? (
          <div className="space-y-4">
            {meta && imageUrl ? (
              <div className="rounded-lg border bg-white p-4">
                <img src={imageUrl} alt="My stored signature" className="max-h-16 w-auto max-w-full" />
              </div>
            ) : meta ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No signature stored yet. Draw one, upload a photo/scan, or have one created from
                your name — it's cropped and cleaned up automatically, so it prints like pen ink
                at the right size.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode('draw')} disabled={working}>
                <PenLine className="mr-1.5 h-4 w-4" />
                {meta ? 'Draw a new one' : 'Draw signature'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode('upload')} disabled={working}>
                <Upload className="mr-1.5 h-4 w-4" />
                {meta ? 'Upload a new image' : 'Upload signature image'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMode('generate')} disabled={working}>
                <Wand2 className="mr-1.5 h-4 w-4" />
                Create one for me
              </Button>
              {meta && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={working}
                  onClick={() =>
                    remove.mutate(undefined, {
                      onSuccess: () => toast({ title: 'Signature removed' }),
                    })
                  }
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>

            {meta && (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Switch
                  id="sig-allow-office"
                  checked={meta.allowOfficeUse}
                  onCheckedChange={v => setAllow.mutate(v === true)}
                  disabled={setAllow.isPending}
                />
                <Label htmlFor="sig-allow-office" className="font-normal cursor-pointer">
                  <span className="font-medium">
                    Teammates may print my signature on office letters and notes
                  </span>
                  <br />
                  <span className="text-sm text-muted-foreground">
                    Off = your signature appears only on letters you prepare yourself. You can turn
                    this off any time.
                  </span>
                </Label>
              </div>
            )}
          </div>
        ) : mode === 'draw' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Sign with a finger, stylus, or mouse</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  padRef.current?.clear();
                  setDrawnDataUrl(null);
                }}
              >
                <Eraser className="mr-1 h-3 w-3" />Clear
              </Button>
            </div>
            <SignaturePadCanvas
              ref={padRef}
              ariaLabel="My signature pad"
              onChange={setDrawnDataUrl}
              background="transparent"
              className="h-36 w-full touch-none rounded-lg border bg-white sm:h-44"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveDrawn} disabled={!drawnDataUrl || working}>
                {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save signature
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setMode('view'); setDrawnDataUrl(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : mode === 'generate' ? (
          <div className="space-y-3">
            {myName === '' ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Add your name to your profile first — generated signatures are always built from
                your own name.
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  A few handwritten-style options based on your name, <strong>{myName}</strong> —
                  for when you'd rather not use your actual handwriting. Pick one, or generate a
                  new set.
                </p>
                {genBusy ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {genOptions.map((opt, i) => (
                      <button
                        key={opt.url}
                        type="button"
                        onClick={() => setGenSelected(i)}
                        aria-pressed={genSelected === i}
                        className={`rounded-lg border bg-white p-3 transition-colors ${
                          genSelected === i ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/40'
                        }`}
                      >
                        <img
                          src={opt.url}
                          alt={`Signature option ${i + 1}`}
                          className="mx-auto max-h-14 w-auto max-w-full"
                        />
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={saveGenerated} disabled={genSelected === null || working || genBusy}>
                    {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Use this signature
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={genBusy || working}
                    onClick={() => setGenSeed(s => (s + 1) | 0)}
                  >
                    <RefreshCw className="mr-1.5 h-4 w-4" />
                    New options
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A transparent PNG works best, but any clear photo or scan of your signature on white
              paper works — the background is removed and the image cropped automatically.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => onFilePicked(e.target.files?.[0])}
            />
            {uploadPreview ? (
              <div className="space-y-3">
                <div className="rounded-lg border bg-white p-4">
                  <img src={uploadPreview.url} alt="Signature preview" className="max-h-16 w-auto max-w-full" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={working} onClick={() => finishSave(uploadPreview.blob)}>
                    {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Save signature
                  </Button>
                  <Button variant="outline" size="sm" disabled={working} onClick={() => fileRef.current?.click()}>
                    Choose a different image
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setUploadPreview(null); setMode('view'); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => fileRef.current?.click()} disabled={working}>
                  {working ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1.5 h-4 w-4" />
                  )}
                  Choose image
                </Button>
                <Button variant="outline" size="sm" onClick={() => setMode('view')}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        <Alert>
          <AlertTitle className="text-sm">Patient signatures are different</AlertTitle>
          <AlertDescription className="text-xs">
            Signatures patients or guardians draw in Complete Forms are never stored — they exist
            only in that workflow's memory and on the printed page. This card manages your own
            signature only.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
