import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { DEFAULT_SIGNATURE_INTRO } from '@/lib/fof/defaults';
import type { FofTemplate } from '@/lib/fof/types';
import type { FofTemplateUpsert } from '@/hooks/useFofTemplates';

// De-identified template wording/config only — no patient data here.

interface FofTemplateEditorProps {
  open: boolean;
  template: FofTemplate | null; // null = create new
  saving: boolean;
  onSave: (template: FofTemplateUpsert) => void;
  onClose: () => void;
}

interface EditorState {
  name: string;
  discountPercent: string;
  discountLabel: string;
  showInsuranceEstimate: boolean;
  showWriteOff: boolean;
  showPrepayOption: boolean;
  showInstallmentOption: boolean;
  installmentCount: string;
  installmentLabels: string;
  footnotes: string;
  signatureIntro: string;
  isActive: boolean;
}

const NEW_TEMPLATE: EditorState = {
  name: '',
  discountPercent: '10',
  discountLabel: 'Prepay Discount**',
  showInsuranceEstimate: false,
  showWriteOff: false,
  showPrepayOption: true,
  showInstallmentOption: true,
  installmentCount: '3',
  installmentLabels: 'Visit 1 (Upon scheduling)\nVisit 2 (Prep date)\nVisit 3 (On delivery)',
  footnotes: '',
  signatureIntro: DEFAULT_SIGNATURE_INTRO,
  isActive: true,
};

function toEditorState(t: FofTemplate): EditorState {
  return {
    name: t.name,
    discountPercent: String(t.discountPercent),
    discountLabel: t.discountLabel,
    showInsuranceEstimate: t.showInsuranceEstimate,
    showWriteOff: t.showWriteOff,
    showPrepayOption: t.showPrepayOption,
    showInstallmentOption: t.showInstallmentOption,
    installmentCount: String(t.installmentCount),
    installmentLabels: t.installmentLabels.join('\n'),
    footnotes: t.footnotes.join('\n\n'),
    signatureIntro: t.signatureIntro,
    isActive: t.isActive,
  };
}

export default function FofTemplateEditor({
  open,
  template,
  saving,
  onSave,
  onClose,
}: FofTemplateEditorProps) {
  const [state, setState] = useState<EditorState>(NEW_TEMPLATE);

  useEffect(() => {
    if (open) setState(template ? toEditorState(template) : NEW_TEMPLATE);
  }, [open, template]);

  const set = <K extends keyof EditorState>(field: K, value: EditorState[K]) =>
    setState(s => ({ ...s, [field]: value }));

  const installmentCount = Math.min(6, Math.max(1, parseInt(state.installmentCount, 10) || 3));
  const canSave = state.name.trim() !== '';

  const handleSave = () => {
    onSave({
      ...(template ? { id: template.id } : {}),
      name: state.name.trim(),
      sortOrder: template?.sortOrder ?? 99,
      isActive: state.isActive,
      discountPercent: Math.max(0, parseFloat(state.discountPercent) || 0),
      discountLabel: state.discountLabel.trim(),
      showInsuranceEstimate: state.showInsuranceEstimate,
      showWriteOff: state.showWriteOff,
      showPrepayOption: state.showPrepayOption,
      showInstallmentOption: state.showInstallmentOption,
      installmentCount,
      installmentLabels: state.installmentLabels
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean),
      footnotes: state.footnotes
        .split(/\n{2,}/)
        .map(p => p.replace(/\n/g, ' ').trim())
        .filter(Boolean),
      signatureIntro: state.signatureIntro.trim() || DEFAULT_SIGNATURE_INTRO,
    });
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? `Edit "${template.name}"` : 'New Template'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input
                id="tpl-name"
                value={state.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Self-Pay"
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="tpl-active"
                checked={state.isActive}
                onCheckedChange={v => set('isActive', v)}
              />
              <Label htmlFor="tpl-active">Active</Label>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-discount">Discount %</Label>
              <Input
                id="tpl-discount"
                inputMode="decimal"
                value={state.discountPercent}
                onChange={e => set('discountPercent', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-discount-label">Discount Label</Label>
              <Input
                id="tpl-discount-label"
                value={state.discountLabel}
                onChange={e => set('discountLabel', e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-ins"
                checked={state.showInsuranceEstimate}
                onCheckedChange={v => set('showInsuranceEstimate', v)}
              />
              <Label htmlFor="tpl-ins">Insurance estimate line</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-writeoff"
                checked={state.showWriteOff}
                onCheckedChange={v => set('showWriteOff', v)}
              />
              <Label htmlFor="tpl-writeoff">Insurance write-off line</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-prepay"
                checked={state.showPrepayOption}
                onCheckedChange={v => set('showPrepayOption', v)}
              />
              <Label htmlFor="tpl-prepay">Prepay in Full option</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tpl-installments"
                checked={state.showInstallmentOption}
                onCheckedChange={v => set('showInstallmentOption', v)}
              />
              <Label htmlFor="tpl-installments">Installment option</Label>
            </div>
          </div>

          {state.showInstallmentOption && (
            <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-count">Installments</Label>
                <Input
                  id="tpl-count"
                  inputMode="numeric"
                  value={state.installmentCount}
                  onChange={e => set('installmentCount', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-labels">Installment Labels (one per line)</Label>
                <Textarea
                  id="tpl-labels"
                  rows={3}
                  value={state.installmentLabels}
                  onChange={e => set('installmentLabels', e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tpl-footnotes">
              Footnotes (separate paragraphs with a blank line)
            </Label>
            <Textarea
              id="tpl-footnotes"
              rows={8}
              value={state.footnotes}
              onChange={e => set('footnotes', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-sig">Signature Line Intro</Label>
            <Input
              id="tpl-sig"
              value={state.signatureIntro}
              onChange={e => set('signatureIntro', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
