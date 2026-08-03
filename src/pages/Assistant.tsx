/**
 * Ask AI — chat with Kimi (via OpenRouter) over the office knowledge base
 * (policies, HR info, insurance handbooks) and the assistant's standing
 * memory. Answers cite the documents they came from. Managers can also
 * have it remember office/site facts and build on the app itself — code
 * changes are committed to GitHub, where Lovable syncs them into the app.
 * Conversation lives in memory only. The knowledge base is for internal
 * business documents — the UI reminds staff not to upload patient records.
 */
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  FileText,
  FolderInput,
  Info,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  useAskDocs,
  useDeleteOfficeDoc,
  useOfficeDocs,
  useUpdateOfficeDoc,
  useUploadOfficeDoc,
  type ChatMessage,
  type OfficeDoc,
} from '@/hooks/useOfficeDocs';
import {
  AI_SCOPES,
  DOC_COLLECTION_LABELS,
  DOC_COLLECTION_OPTIONS,
  LIBRARY_AREA_LABELS,
  LIBRARY_AREA_OPTIONS,
  parseAiScope,
  resolveDocPlacement,
  type DocCollection,
  type LibraryArea,
} from '@/lib/doc-library';
import { ActionChips } from '@/components/fof/FofAssistantWidget';
import AssistantMemoryPanel from '@/components/AssistantMemoryPanel';
import { useAssistantMemories, useAuditFindings } from '@/hooks/useAssistantMemory';
import { useOrgContext } from '@/hooks/useOrgContext';
import CaptureChips from '@/components/copilot/CaptureChips';
import { useCommitmentListen } from '@/hooks/useCopilot';

const SUGGESTED_QUESTIONS = [
  'What is our PTO accrual policy?',
  'How do we handle a patient insurance write-off?',
  'What is the office late-arrival policy?',
];

function ChatPanel({ scope, onClearScope }: { scope: ReturnType<typeof parseAiScope>; onClearScope: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const ask = useAskDocs();
  const listen = useCommitmentListen();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const send = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    // Commitment listening: if they just said they'd do something, offer to
    // hold it for them. Never blocks or delays the answer.
    listen.mutate(trimmed);
    ask.mutate(
      { question: trimmed, history, scope },
      {
        onSuccess: result => {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: result.answer,
              sources: result.sources,
              actions: result.actions,
            },
          ]);
          requestAnimationFrame(() =>
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
          );
        },
        onError: err => {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: `Sorry — that didn't work: ${err.message}` },
          ]);
        },
      }
    );
  };

  return (
    <Card className="flex flex-col h-[calc(100vh-16rem)] min-h-[24rem]">
      {scope && (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-xs">
          <span className="text-muted-foreground">Searching only:</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
            {AI_SCOPES[scope].label}
            <button type="button" onClick={onClearScope} aria-label="Search all documents">
              <X className="h-3 w-3" />
            </button>
          </span>
          <span className="text-muted-foreground">Remove to search every approved document.</span>
        </div>
      )}
      <CardContent ref={scrollRef} className="flex-1 overflow-y-auto pt-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="h-8 w-8 text-primary" />
            <div className="text-muted-foreground text-sm max-w-md">
              Ask anything covered by the office's policies, HR documents, or insurance
              handbooks. Answers cite the document they came from.
              {isManager && (
                <>
                  {' '}
                  You can also tell me things to remember about the office or the site, and
                  ask me to build changes to this app — code I write is pushed to GitHub and
                  Lovable picks it up.
                </>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map(q => (
                <Button key={q} variant="outline" size="sm" onClick={() => send(q)}>
                  {q}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, i) => (
            <div
              key={i}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {message.content}
                {message.sources && message.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/50">
                    {message.sources.map(source => (
                      <Badge key={source.id} variant="secondary" className="font-normal">
                        <FileText className="h-3 w-3 mr-1" />
                        {source.title}
                        {source.section_title && (
                          <span className="ml-1 text-muted-foreground">
                            · {source.section_title}
                            {source.page_number ? ` (p. ${source.page_number})` : ''}
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                )}
                <ActionChips actions={message.actions ?? []} />
              </div>
            </div>
          ))
        )}
        {ask.isPending && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </CardContent>
      <div className="border-t p-3 space-y-1.5">
        {/* "Want this on your list?" — one tap, drafted for the right day. */}
        <CaptureChips surface="ai_channel" />
        <div className="flex gap-2">
        <Input
          placeholder="Ask about office policies, HR, insurance…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          disabled={ask.isPending}
        />
        <Button onClick={() => send(input)} disabled={ask.isPending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
        </div>
        {/* Questions go to an external AI service (no BAA) — keep them generic. */}
        <p className="text-xs text-muted-foreground">
          Answers come from an external AI service (Kimi, via OpenRouter). Ask in general
          terms — never include a patient's name or details.
        </p>
      </div>
    </Card>
  );
}

/**
 * The two placement questions every new document answers:
 * where it lives in the product, and what kind of document it is.
 * Also reused by the "Move" dialog so placement can change later.
 */
function PlacementFields({
  libraryArea,
  collection,
  onLibraryArea,
  onCollection,
}: {
  libraryArea: LibraryArea;
  collection: DocCollection;
  onLibraryArea: (value: LibraryArea) => void;
  onCollection: (value: DocCollection) => void;
}) {
  const areaHint = LIBRARY_AREA_OPTIONS.find(o => o.value === libraryArea)?.hint;
  return (
    <>
      <div className="space-y-1.5">
        <Label>Where should this document live?</Label>
        <Select value={libraryArea} onValueChange={v => onLibraryArea(v as LibraryArea)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LIBRARY_AREA_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {areaHint && <p className="text-xs text-muted-foreground">{areaHint}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>What kind of document is it?</Label>
        <Select value={collection} onValueChange={v => onCollection(v as DocCollection)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_COLLECTION_OPTIONS.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const upload = useUploadOfficeDoc();
  const [title, setTitle] = useState('');
  const [libraryArea, setLibraryArea] = useState<LibraryArea>('workplace');
  const [collection, setCollection] = useState<DocCollection>('handbook');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [mode, setMode] = useState<'file' | 'text'>('file');

  const reset = () => {
    setTitle('');
    setLibraryArea('workplace');
    setCollection('handbook');
    setFile(null);
    setPastedText('');
    setMode('file');
  };

  const canSubmit =
    title.trim() !== '' && (mode === 'file' ? !!file : pastedText.trim() !== '');

  const submit = () => {
    upload.mutate(
      {
        title: title.trim(),
        libraryArea,
        collection,
        file: mode === 'file' ? file ?? undefined : undefined,
        text: mode === 'text' ? pastedText : undefined,
      },
      {
        onSuccess: result => {
          toast.success(`Added "${title.trim()}" (${result.chunks} sections indexed)`);
          reset();
          onClose();
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              placeholder="e.g. Employee Handbook 2026"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <PlacementFields
            libraryArea={libraryArea}
            collection={collection}
            onLibraryArea={setLibraryArea}
            onCollection={setCollection}
          />
          <Tabs value={mode} onValueChange={v => setMode(v as 'file' | 'text')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">Upload File</TabsTrigger>
              <TabsTrigger value="text">Paste Text</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="space-y-1.5">
              <Input
                type="file"
                accept=".pdf,.txt,.md,text/plain,application/pdf"
                onChange={e => {
                  const selected = e.target.files?.[0] ?? null;
                  if (selected && selected.size > 8 * 1024 * 1024) {
                    toast.error('File is larger than 8 MB. Split it or paste the text.');
                    e.target.value = '';
                    return;
                  }
                  setFile(selected);
                }}
              />
              <p className="text-xs text-muted-foreground">
                PDF or text files up to 8 MB. Scanned/image-only PDFs can't be read — paste
                the text instead.
              </p>
            </TabsContent>
            <TabsContent value="text">
              <Textarea
                rows={6}
                placeholder="Paste the policy or handbook text here…"
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
              />
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit || upload.isPending}>
            {upload.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Managers change where a document lives without re-uploading it. */
function MoveDialog({ doc, onClose }: { doc: OfficeDoc | null; onClose: () => void }) {
  const update = useUpdateOfficeDoc();
  const placement = doc ? resolveDocPlacement(doc) : null;
  const [libraryArea, setLibraryArea] = useState<LibraryArea>('workplace');
  const [collection, setCollection] = useState<DocCollection>('handbook');
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Seed the selects from the document each time a new one is opened.
  if (doc && placement && openedFor !== doc.id) {
    setOpenedFor(doc.id);
    setLibraryArea(placement.libraryArea);
    setCollection(placement.collection);
  }

  const submit = () => {
    if (!doc) return;
    update.mutate(
      { id: doc.id, libraryArea, collection },
      {
        onSuccess: () => {
          toast.success(`Moved "${doc.title}" to ${LIBRARY_AREA_LABELS[libraryArea]}`);
          onClose();
        },
        onError: err => toast.error(err.message),
      }
    );
  };

  return (
    <Dialog open={!!doc} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move Document</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Choose where “{doc?.title}” lives and what kind of document it is. Readers update
          immediately — nothing is re-uploaded.
        </p>
        <div className="space-y-3">
          <PlacementFields
            libraryArea={libraryArea}
            collection={collection}
            onLibraryArea={setLibraryArea}
            onCollection={setCollection}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Placement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocsPanel() {
  const { data: docs, isLoading } = useOfficeDocs();
  const { data: ctx } = useOrgContext();
  const deleteDoc = useDeleteOfficeDoc();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [moveDoc, setMoveDoc] = useState<OfficeDoc | null>(null);

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const unplacedCount = (docs ?? []).filter(
    d => resolveDocPlacement(d).libraryArea === 'unassigned'
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {docs?.length ?? 0} document{docs?.length === 1 ? '' : 's'} in the knowledge base
        </p>
        {isManager && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Document
          </Button>
        )}
      </div>
      {!isManager && (
        <p className="text-xs text-muted-foreground">
          Only managers can add or remove documents. Ask a manager if something is missing.
        </p>
      )}
      {isManager && unplacedCount > 0 && (
        <Alert>
          <FolderInput className="h-4 w-4" />
          <AlertDescription>
            {unplacedCount === 1 ? 'One document needs' : `${unplacedCount} documents need`} a
            home. Unplaced documents stay out of the Office Handbook and Insurance Desk until
            you move them — use the move button on a document to place it.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : (docs ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No documents yet. Add your office policies, employee handbook, and insurance
            handbooks so the assistant can look things up.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(docs ?? []).map((doc: OfficeDoc) => {
            const placement = resolveDocPlacement(doc);
            const unplaced = placement.libraryArea === 'unassigned';
            return (
              <Card key={doc.id}>
                <CardContent className="py-3 flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{doc.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Badge
                        variant={unplaced ? 'destructive' : 'secondary'}
                        className="font-normal"
                      >
                        {LIBRARY_AREA_LABELS[placement.libraryArea]}
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        {DOC_COLLECTION_LABELS[placement.collection]}
                      </Badge>
                      <span>
                        {new Date(doc.created_at).toLocaleDateString()} ·{' '}
                        {Math.max(1, Math.round(doc.char_count / 1000))}k characters
                      </span>
                    </div>
                  </div>
                  {isManager && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        title="Move — change where this document lives"
                        onClick={() => setMoveDoc(doc)}
                      >
                        <FolderInput className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive shrink-0"
                        onClick={() => {
                          if (confirm(`Remove "${doc.title}" from the knowledge base?`)) {
                            deleteDoc.mutate(doc, {
                              onError: err => toast.error(`Delete failed: ${err.message}`),
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This knowledge base is for internal business documents only — policies, HR
          materials, and insurance plan handbooks. Do not upload documents containing
          patient information.
        </AlertDescription>
      </Alert>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      <MoveDialog doc={moveDoc} onClose={() => setMoveDoc(null)} />
    </div>
  );
}

export default function Assistant() {
  // Badge the tab when something is genuinely waiting on a person:
  // contradictions held out of answers, plus open auditor findings.
  const { data: memories } = useAssistantMemories();
  const { data: findings } = useAuditFindings();
  const pendingCount =
    (memories ?? []).filter(m => m.status === 'pending').length + (findings ?? []).length;

  // Contextual scope: arriving from the Office Handbook or Insurance Desk
  // limits document search to that surface until the chip is removed.
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = parseAiScope(searchParams.get('scope'));

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Ask AI</h1>
      </div>

      <Tabs defaultValue="chat">
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5">
            Memory &amp; Audit
            {pendingCount > 0 && (
              <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px]">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat">
          <ChatPanel scope={scope} onClearScope={() => setSearchParams({}, { replace: true })} />
        </TabsContent>
        <TabsContent value="documents">
          <DocsPanel />
        </TabsContent>
        <TabsContent value="memory">
          <AssistantMemoryPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
