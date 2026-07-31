import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, FileSpreadsheet, Download, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useActiveTeam, currentMonth, monthLabel } from '@/hooks/useGoals';
import { useImportGoalsCsv, type ImportOutcome } from '@/hooks/useGoalImport';
import { GOAL_CSV_TEMPLATE, planGoalsFromCsv, type ParseResult } from '@/lib/goal-csv';

export default function GoalsCsvImport() {
  const { user } = useAuth();
  const { data: team } = useActiveTeam();
  const importer = useImportGoalsCsv();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [result, setResult] = useState<ImportOutcome | null>(null);

  const selfName = useMemo(
    () => team?.find(t => t.user_id === user?.id)?.display_name ?? 'Me',
    [team, user?.id]
  );

  const ready = parsed?.goals.filter(g => g.ownerUserId && g.target.trim()) ?? [];
  const blocked = parsed?.goals.filter(g => !g.ownerUserId || !g.target.trim()) ?? [];

  const reset = () => {
    setParsed(null);
    setResult(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setFileName(file.name);
    setResult(null);
    setParsed(
      planGoalsFromCsv(text, {
        defaultMonth: currentMonth(),
        people: team ?? [],
        selfUserId: user?.id ?? '',
        selfName,
      })
    );
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([GOAL_CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'goals-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    const outcome = await importer.mutateAsync(ready);
    setResult(outcome);
    if (outcome.created > 0) {
      toast.success(
        `${outcome.created} goal${outcome.created === 1 ? '' : 's'} added`,
        outcome.steps ? { description: `${outcome.steps} steps came along too.` } : undefined
      );
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Upload className="mr-2 h-4 w-4" />
        Import from CSV
      </Button>

      <Dialog
        open={open}
        onOpenChange={o => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk import goals</DialogTitle>
            <DialogDescription>
              One row per step. Rows that share an owner and a goal title become one goal with
              several steps.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Choose CSV
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Template
              </Button>
              {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            </div>

            <p className="text-xs text-muted-foreground">
              Columns: owner, goal, target, month, visibility, step, step_due. Dates read as
              YYYY-MM-DD or M/D/YYYY. Blank month means {monthLabel(currentMonth())}.
            </p>

            {parsed && !result && (
              <div className="space-y-3">
                {parsed.errors.length > 0 && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    {parsed.errors.slice(0, 6).map(e => (
                      <div key={`${e.line}-${e.message}`}>
                        Line {e.line}: {e.message}
                      </div>
                    ))}
                  </div>
                )}

                {parsed.goals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing usable in that file yet.</p>
                ) : (
                  <div className="space-y-2">
                    {parsed.goals.map(g => {
                      const ok = !!g.ownerUserId && !!g.target.trim();
                      return (
                        <div
                          key={g.key}
                          className={`rounded-md border p-3 text-sm ${ok ? '' : 'border-destructive/50 bg-destructive/5'}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{g.title}</span>
                            <Badge variant="secondary">{g.owner}</Badge>
                            <Badge variant="outline">{g.month}</Badge>
                            {g.visibility === 'private' && <Badge variant="outline">Private</Badge>}
                          </div>
                          {g.target && (
                            <div className="mt-1 text-muted-foreground">Target: {g.target}</div>
                          )}
                          {g.steps.length > 0 && (
                            <ul className="mt-2 space-y-1 text-muted-foreground">
                              {g.steps.map(s => (
                                <li key={`${s.line}-${s.title}`}>
                                  • {s.title}
                                  {s.due_date ? ` — due ${s.due_date}` : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                          {!ok && (
                            <div className="mt-2 flex items-start gap-1 text-destructive">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>{g.problems.join(' ')}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-sm text-muted-foreground">
                    {ready.length} ready
                    {blocked.length > 0 ? `, ${blocked.length} need a fix` : ''}
                  </span>
                  <Button
                    onClick={runImport}
                    disabled={ready.length === 0 || importer.isPending || !importer.isReady}
                  >
                    {importer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Import {ready.length} goal{ready.length === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-primary">
                  <Check className="h-4 w-4" />
                  {result.created} goal{result.created === 1 ? '' : 's'} and {result.steps} step
                  {result.steps === 1 ? '' : 's'} added.
                </div>
                {result.failed.map(f => (
                  <div key={`${f.owner}-${f.title}`} className="text-destructive">
                    {f.owner} — {f.title}: {f.message}
                  </div>
                ))}
                <div className="pt-2">
                  <Button variant="outline" size="sm" onClick={reset}>
                    Import another file
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
