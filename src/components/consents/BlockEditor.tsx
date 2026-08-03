import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Copy, Trash2, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  SECTION_KIND_LABELS, SIGNATURE_ROLE_LABELS, SIGNATURE_ROLES, blockTypeLabel,
  type ConsentBlock, type ConsentSectionKind, type SignatureRole,
} from '@/lib/consents/types';

/**
 * One editable block row in the form builder: drag handle, the fields that
 * matter for its type, required/conditional controls, duplicate and delete.
 * The layout itself is not editable — every template renders through the
 * same master print layout, so offices edit content, not page design.
 */

/** Block types that can carry a required flag. */
const REQUIRABLE = new Set([
  'checkbox', 'yesno', 'short_answer', 'long_answer', 'date', 'tooth_numbers',
  'procedure', 'provider', 'patient_name', 'cost', 'initials', 'signature', 'medications',
]);

/** Block types a conditional rule can hang off (they produce an answer). */
export const CONDITION_SOURCES = new Set(['yesno', 'checkbox']);

/** Block types that may be shown conditionally. */
const CONDITIONABLE = new Set([
  'section', 'instruction', 'paragraph', 'bullets', 'checkbox', 'yesno',
  'short_answer', 'long_answer', 'date', 'tooth_numbers', 'procedure',
  'provider', 'patient_name', 'cost', 'initials', 'signature', 'medications',
]);

export interface BlockEditorProps {
  block: ConsentBlock;
  /** Earlier yes/no + checkbox blocks a condition may reference. */
  conditionSources: ConsentBlock[];
  onChange: (patch: Partial<ConsentBlock>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

const itemsToText = (items?: string[]) => (items ?? []).join('\n');
const textToItems = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);

export default function BlockEditor({
  block, conditionSources, onChange, onDuplicate, onDelete, disabled,
}: BlockEditorProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const labelField = (placeholder: string) => (
    <Input
      value={block.label ?? ''}
      onChange={e => onChange({ label: e.target.value })}
      placeholder={placeholder}
      disabled={disabled}
      className="h-8"
    />
  );

  const bodyField = (placeholder: string, rows = 3) => (
    <Textarea
      value={block.body ?? ''}
      onChange={e => onChange({ body: e.target.value })}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className="text-sm"
    />
  );

  const itemsField = (placeholder: string) => (
    <Textarea
      value={itemsToText(block.items)}
      onChange={e => onChange({ items: e.target.value.split('\n') })}
      onBlur={e => onChange({ items: textToItems(e.target.value) })}
      placeholder={placeholder}
      disabled={disabled}
      rows={Math.max(3, (block.items ?? []).length + 1)}
      className="text-sm font-mono"
    />
  );

  const fields = () => {
    switch (block.type) {
      case 'title':
        return labelField('Form title');
      case 'section':
        return (
          <div className="space-y-2">
            <div className="flex gap-2">
              {labelField('Section heading')}
              <Select
                value={block.kind ?? 'other'}
                onValueChange={v => onChange({ kind: v as ConsentSectionKind })}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 w-56 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SECTION_KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {bodyField('Optional lead paragraph under the heading', 2)}
          </div>
        );
      case 'instruction':
        return bodyField('Emphasized instruction text', 2);
      case 'paragraph':
        return bodyField('Paragraph text');
      case 'bullets':
        return itemsField('One bullet per line');
      case 'medications':
        return (
          <div className="space-y-2">
            {labelField('Selection label, e.g. “Prescribed today”')}
            {itemsField('One medication option per line')}
          </div>
        );
      case 'signature':
        return (
          <Select
            value={block.role ?? 'patient'}
            onValueChange={v => onChange({ role: v as SignatureRole })}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SIGNATURE_ROLES.map(role => (
                <SelectItem key={role} value={role}>{SIGNATURE_ROLE_LABELS[role]} signature</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case 'logo':
      case 'divider':
        return <p className="text-xs text-muted-foreground">No options — rendered by the master layout.</p>;
      case 'page_break':
        return <p className="text-xs text-muted-foreground">The next block starts a new printed page.</p>;
      default:
        // Field blocks: label + (for checkbox/initials the label is the statement).
        return labelField(
          block.type === 'checkbox' || block.type === 'initials'
            ? 'Statement the patient checks or initials'
            : block.type === 'yesno'
              ? 'Question with Yes / No answer'
              : 'Field label',
        );
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-card p-3 ${block.type === 'page_break' ? 'border-dashed' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground disabled:opacity-40"
          aria-label="Drag to reorder"
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {blockTypeLabel(block.type)}
            </span>
            <div className="flex items-center gap-2">
              {REQUIRABLE.has(block.type) && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Required
                  <Switch
                    checked={block.required ?? false}
                    onCheckedChange={v => onChange({ required: v })}
                    disabled={disabled}
                    className="scale-75"
                  />
                </label>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} disabled={disabled} aria-label="Duplicate block">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete} disabled={disabled} aria-label="Delete block">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {fields()}

          {CONDITIONABLE.has(block.type) && conditionSources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs text-muted-foreground">Show only when</Label>
              <Select
                value={block.condition?.blockId ?? 'always'}
                onValueChange={v =>
                  onChange({
                    condition: v === 'always'
                      ? null
                      : { blockId: v, equals: block.condition?.equals === 'no' ? 'no' : conditionSources.find(s => s.id === v)?.type === 'checkbox' ? 'checked' : 'yes' },
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger className="h-7 w-60 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="always">Always shown</SelectItem>
                  {conditionSources.map(source => (
                    <SelectItem key={source.id} value={source.id}>
                      “{(source.label ?? 'Question').slice(0, 48)}”
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {block.condition && (
                <Select
                  value={block.condition.equals}
                  onValueChange={v =>
                    onChange({ condition: { ...block.condition!, equals: v as NonNullable<ConsentBlock['condition']>['equals'] } })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {conditionSources.find(s => s.id === block.condition!.blockId)?.type === 'checkbox' ? (
                      <>
                        <SelectItem value="checked">is checked</SelectItem>
                        <SelectItem value="unchecked">is unchecked</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="yes">answered Yes</SelectItem>
                        <SelectItem value="no">answered No</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
