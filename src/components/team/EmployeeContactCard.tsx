import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EmployeeContactFields } from '@/lib/employee-contact';

export default function EmployeeContactCard({ employee }: { employee: Partial<Record<keyof EmployeeContactFields, string | null>> }) {
  const address = [employee.address_line1, employee.address_line2,
    [employee.city, employee.state_region, employee.postal_code].filter(Boolean).join(', '), employee.country].filter(Boolean);
  return (
    <Card>
      <CardHeader><CardTitle>Contact and emergency details</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-2 text-sm">
        <div className="space-y-2">
          <h3 className="font-medium">Address and phone</h3>
          {address.length ? <p className="whitespace-pre-line">{address.join('\n')}</p> : <p className="text-muted-foreground">No address added</p>}
          <p>{employee.phone || 'No phone number added'}</p>
          {employee.alternate_phone && <p>Alternate: {employee.alternate_phone}</p>}
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Emergency contact</h3>
          <p>{employee.emergency_contact_name || 'No emergency contact added'}</p>
          {employee.emergency_contact_relationship && <p className="text-muted-foreground">{employee.emergency_contact_relationship}</p>}
          {employee.emergency_contact_phone && <p>{employee.emergency_contact_phone}</p>}
          {employee.emergency_contact_alternate_phone && <p>Alternate: {employee.emergency_contact_alternate_phone}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
