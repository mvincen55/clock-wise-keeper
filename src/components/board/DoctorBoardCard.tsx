import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Clock3, Plus, Trash2 } from 'lucide-react';
import { useDoctorBoard } from '@/hooks/useDoctorBoard';
import { useOrgContext } from '@/hooks/useOrgContext';
import { formatDateShort } from '@/lib/time-utils';

/**
 * The doctor's list.
 *
 * It is theirs. Items are not reported anywhere, nothing counts against
 * anybody, and if the list is empty the card is not rendered at all — no
 * placeholder nudging them to fill it.
 */
export default function DoctorBoardCard() {
  const { data: ctx } = useOrgContext();
  const { open, hasAny, create, complete, snooze, remove, readOnly } = useDoctorBoard();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  if (ctx?.role !== 'owner') return null;
  if (!hasAny && !adding) {
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAdding(true)}>
        <Plus className="mr-1.5 h-4 w-4" /> Start my list
      </Button>
    );
  }

  const add = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({ title });
    setTitle('');
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">My list</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {open.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing on it right now.</p>
        )}
        {open.map(item => (
          <div key={item.id} className="flex items-start gap-2 rounded-md border border-border/60 px-2.5 py-2">
            <Checkbox
              className="mt-0.5"
              checked={false}
              disabled={readOnly}
              onCheckedChange={() => complete.mutate(item)}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm">{item.title}</p>
              {item.note && <p className="text-[11px] text-muted-foreground">{item.note}</p>}
              {item.due_at && (
                <p className="text-[11px] text-muted-foreground">Due {formatDateShort(item.due_at)}</p>
              )}
            </div>
            {!readOnly && (
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => snooze.mutate(item)}>
                  <Clock3 className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove.mutate(item.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {!readOnly && (
          <div className="flex gap-2 pt-1">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder="Add something"
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8" onClick={add} disabled={!title.trim()}>
              Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
