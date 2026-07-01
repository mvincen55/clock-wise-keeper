import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Archive, RotateCcw, Loader2 } from 'lucide-react';
import { useArchivedEmployees, useRestoreEmployee } from '@/hooks/useEmployees';
import { useState } from 'react';

export default function ArchivedMembersDialog() {
  const [open, setOpen] = useState(false);
  const { data: archived, isLoading } = useArchivedEmployees();
  const restore = useRestoreEmployee();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Archive className="mr-1 h-4 w-4" />
          Archived {archived?.length ? `(${archived.length})` : ''}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Archived Team Members</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !archived?.length ? (
          <p className="text-center text-muted-foreground py-6 text-sm">No archived members.</p>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {archived.map(emp => (
              <div key={emp.id} className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <div>
                  <div className="font-medium text-sm">{emp.display_name}</div>
                  {emp.email && <div className="text-xs text-muted-foreground">{emp.email}</div>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(emp.id)}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
