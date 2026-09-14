import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EmployeeNameFields } from '@/lib/employee-name-fields';

export default function EmployeeNameInputs({ value, onChange, disabled }: {
  value: EmployeeNameFields;
  onChange: (value: EmployeeNameFields) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_minmax(0,1fr)]">
      <div className="space-y-1">
        <Label htmlFor={`${id}-first`}>First name</Label>
        <Input id={`${id}-first`} autoComplete="given-name" value={value.first_name} onChange={e => onChange({ ...value, first_name: e.target.value })} required disabled={disabled} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-middle`}>MI <span className="text-xs text-muted-foreground">(optional)</span></Label>
        <Input id={`${id}-middle`} aria-label="Middle initial (optional)" maxLength={2} pattern={'\\p{L}\\.?'} placeholder="A" value={value.middle_initial} onChange={e => onChange({ ...value, middle_initial: e.target.value })} disabled={disabled} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-last`}>Last name</Label>
        <Input id={`${id}-last`} autoComplete="family-name" value={value.last_name} onChange={e => onChange({ ...value, last_name: e.target.value })} required disabled={disabled} />
      </div>
    </div>
  );
}
