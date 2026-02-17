import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Loader2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

type ImportRow = {
  id: string;
  employee_name: string | null;
  employee_code: string | null;
  entry_date: string | null;
  punch_times: string[];
  total_hhmm: string | null;
  note_lines: string[];
  status: string;
};

type ParseResult = {
  success: boolean;
  import_id?: string;
  row_count?: number;
  report_type?: string;
  company_name?: string;
  range?: string;
  error?: string;
  raw_text?: string;
};

type MergeStrategy = 'skip' | 'overwrite' | 'merge';

export default function Import() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportRow[]>([]);
  const [strategy, setStrategy] = useState<MergeStrategy>('skip');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setParseResult(null);
    setPreviewRows([]);
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setParsing(true);
    setParseResult(null);

    try {
      // Convert file to base64
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const { data, error } = await supabase.functions.invoke('parse-pdf', {
        body: { pdfBase64: base64, filename: file.name },
      });

      if (error) throw error;

      if (data.success) {
        setParseResult(data);
        // Fetch preview rows
        const { data: rows } = await supabase
          .from('import_rows')
          .select('*')
          .eq('import_id', data.import_id)
          .order('entry_date', { ascending: true });

        setPreviewRows((rows || []) as ImportRow[]);
        toast({ title: `Extracted ${data.row_count} rows` });
      } else {
        setParseResult(data);
        toast({
          title: 'Partial extraction',
          description: data.error || 'Could not fully parse the PDF',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!parseResult?.import_id) return;
    setConfirming(true);

    try {
      const { data, error } = await supabase.functions.invoke('confirm-import', {
        body: { import_id: parseResult.import_id, strategy },
      });

      if (error) throw error;

      toast({
        title: 'Import complete',
        description: `${data.imported} entries imported, ${data.skipped} skipped`,
      });

      // Reset
      setFile(null);
      setParseResult(null);
      setPreviewRows([]);
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Import PDFs</h1>
        <p className="text-muted-foreground">Upload time punch or payroll reports for extraction</p>
      </div>

      {/* Upload area */}
      <Card className="card-elevated">
        <CardContent className="p-8">
          <div className="border-2 border-dashed border-border rounded-xl p-8 md:p-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Upload PDF Report</p>
            <p className="text-sm text-muted-foreground mb-4">
              Supported: Time Punch Reports, Payroll Reports (Detailed)
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <label>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button asChild variant="outline">
                  <span>Choose File</span>
                </Button>
              </label>
              {file && (
                <Button onClick={handleUpload} disabled={parsing}>
                  {parsing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Extract Data
                    </>
                  )}
                </Button>
              )}
            </div>
            {file && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <span>{file.name}</span>
                <span className="text-muted-foreground">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parse result summary */}
      {parseResult && (
        <Card className={`card-elevated ${parseResult.success ? 'border-success/30' : 'border-warning/30'}`}>
          <CardContent className="p-4 flex items-start gap-3">
            {parseResult.success ? (
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <p className="font-medium">
                {parseResult.success
                  ? `Extracted ${parseResult.row_count} rows from ${parseResult.report_type} report`
                  : 'Extraction needs review'}
              </p>
              {parseResult.company_name && (
                <p className="text-muted-foreground">Company: {parseResult.company_name}</p>
              )}
              {parseResult.range && (
                <p className="text-muted-foreground">Range: {parseResult.range}</p>
              )}
              {parseResult.error && (
                <p className="text-destructive mt-1">{parseResult.error}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview table */}
      {previewRows.length > 0 && (
        <Card className="card-elevated overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">Preview Extracted Data</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Employee</th>
                  <th className="px-4 py-2 text-left">Punches</th>
                  <th className="px-4 py-2 text-left">Total</th>
                  <th className="px-4 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {previewRows.map((row) => (
                  <tr key={row.id} className={!row.entry_date ? 'bg-primary/5 font-semibold' : ''}>
                    <td className="px-4 py-2">
                      {row.entry_date ? formatDate(row.entry_date) : '—'}
                    </td>
                    <td className="px-4 py-2">
                      {row.employee_name}
                      {row.employee_code && <span className="text-muted-foreground ml-1">({row.employee_code})</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(row.punch_times || []).map((t, i) => (
                          <span
                            key={i}
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              i % 2 === 0 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                            }`}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 time-display font-medium">{row.total_hhmm || '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                      {(row.note_lines || []).join('; ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confirm section */}
          <div className="border-t p-4 space-y-3">
            <div>
              <p className="text-sm font-medium mb-2">If dates already exist:</p>
              <div className="flex flex-wrap gap-2">
                {(['skip', 'overwrite', 'merge'] as MergeStrategy[]).map((s) => (
                  <Button
                    key={s}
                    variant={strategy === s ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStrategy(s)}
                  >
                    {s === 'skip' && 'Skip existing'}
                    {s === 'overwrite' && 'Overwrite'}
                    {s === 'merge' && 'Merge (dedupe)'}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleConfirm} disabled={confirming} className="w-full sm:w-auto">
              {confirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Confirm Import ({previewRows.filter(r => r.entry_date).length} entries)
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
