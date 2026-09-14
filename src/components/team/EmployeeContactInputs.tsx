import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { EmployeeContactFields } from '@/lib/employee-contact';

const fields = [
  ['phone', 'Phone number', 'tel', 'tel'],
  ['alternate_phone', 'Alternate phone number', 'tel', 'off'],
  ['address_line1', 'Street address', 'text', 'address-line1'],
  ['address_line2', 'Apartment, suite, etc.', 'text', 'address-line2'],
  ['city', 'City', 'text', 'address-level2'],
  ['state_region', 'State / province', 'text', 'address-level1'],
  ['postal_code', 'ZIP / postal code', 'text', 'postal-code'],
  ['country', 'Country', 'text', 'country-name'],
] as const;

export default function EmployeeContactInputs({ value, onChange, disabled }: {
  value: EmployeeContactFields;
  onChange: (value: EmployeeContactFields) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-5"><fieldset className="space-y-3">
      <legend className="text-sm font-medium">Address and phone <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map(([key, label, type, autoComplete]) => (
          <div key={key} className={`space-y-1 ${key === 'address_line1' || key === 'address_line2' ? 'sm:col-span-2' : ''}`}>
            <Label htmlFor={`${id}-${key}`}>{label}</Label>
            <Input id={`${id}-${key}`} type={type} autoComplete={autoComplete} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} disabled={disabled} />
          </div>
        ))}
      </div>
    </fieldset>
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Emergency contact <span className="font-normal text-muted-foreground">(optional)</span></legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([
          ['emergency_contact_name', 'Contact name', 'text'],
          ['emergency_contact_relationship', 'Relationship', 'text'],
          ['emergency_contact_phone', 'Emergency contact phone', 'tel'],
          ['emergency_contact_alternate_phone', 'Emergency contact alternate phone', 'tel'],
        ] as const).map(([key, label, type]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`${id}-${key}`}>{label}</Label>
            <Input id={`${id}-${key}`} type={type} value={value[key]} onChange={e => onChange({ ...value, [key]: e.target.value })} disabled={disabled} />
          </div>
        ))}
      </div>
    </fieldset></div>
  );
}
