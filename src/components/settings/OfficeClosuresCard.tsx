import { useState } from 'react';
import { useOfficeClosures, useGenerateClosures, useAddClosure, useDeleteClosure } from '@/hooks/useOfficeClosures';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CalendarDays, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';

/**
 * Office closures: generated holidays plus custom closure days. The calendar
 * is readable by everyone (it also feeds the Office Calendar); generating,
 * adding, and deleting are manager actions.
 */
export default function OfficeClosuresCard({ isManager }: { isManager: boolean }) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [closureYear, setClosureYear] = useState(currentYear);
  const { data: closures, isLoading: closuresLoading } = useOfficeClosures(closureYear);
  const generateClosures = useGenerateClosures();
  const addClosure = useAddClosure();
  const deleteClosure = useDeleteClosure();
  const [addClosureOpen, setAddClosureOpen] = useState(false);
  const [newClosure, setNewClosure] = useState({ date: '', name: '' });

  const handleGenerate = async () => {
    try {
      await generateClosures.mutateAsync(closureYear);
      toast({ title: `Generated closures for ${closureYear}` });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const handleAddClosure = async () => {
    if (!newClosure.date || !newClosure.name) return;
    try {
      await addClosure.mutateAsync({ closure_date: newClosure.date, name: newClosure.name });
      setAddClosureOpen(false);
      setNewClosure({ date: '', name: '' });
      toast({ title: 'Closure added' });
    } catch (err) {
      toast({ title: 'Error', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Office Closures
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setClosureYear(y => y - 1)}>←</Button>
            <span className="font-semibold text-sm">{closureYear}</span>
            <Button variant="outline" size="sm" onClick={() => setClosureYear(y => y + 1)}>→</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {isManager && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleGenerate} disabled={generateClosures.isPending} variant="secondary">
            {generateClosures.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Generate for {closureYear}
          </Button>
          <Dialog open={addClosureOpen} onOpenChange={setAddClosureOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Custom
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Custom Closure</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={newClosure.date} onChange={e => setNewClosure({ ...newClosure, date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={newClosure.name} onChange={e => setNewClosure({ ...newClosure, name: e.target.value })} placeholder="Office event, snow day..." />
                </div>
                <Button onClick={handleAddClosure} disabled={addClosure.isPending} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        )}

        {closuresLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !closures?.length ? (
          <p className="text-center text-muted-foreground py-8">No closures for {closureYear}. Click "Generate" to add standard holidays.</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {closures.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Closed</span>
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(c.closure_date)}</p>
                  </div>
                </div>
                {isManager && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteClosure.mutate(c.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
