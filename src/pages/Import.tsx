import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertTriangle } from 'lucide-react';

export default function Import() {
  const [file, setFile] = useState<File | null>(null);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Import PDFs</h1>
        <p className="text-muted-foreground">Upload time punch or payroll reports</p>
      </div>

      <Card className="card-elevated">
        <CardContent className="p-8">
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Upload PDF Report</p>
            <p className="text-sm text-muted-foreground mb-4">
              Supported: Time Punch Reports, Payroll Reports (Detailed)
            </p>
            <label>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <Button asChild variant="outline">
                <span>Choose File</span>
              </Button>
            </label>
            {file && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <span>{file.name}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="card-elevated border-warning/30 bg-warning/5">
        <CardContent className="p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">PDF Import Coming Soon</p>
            <p className="text-muted-foreground">
              PDF parsing with AI-powered extraction will be available in the next update. 
              The upload UI and database schema are ready — extraction logic will parse your 
              Time Punch and Payroll reports automatically.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
