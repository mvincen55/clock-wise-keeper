import { usePayrollSettings, useUpsertPayrollSettings } from '@/hooks/usePayrollSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign } from 'lucide-react';

const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

/** Pay period, week start, and shift buffers. Org-wide, managers only. */
export default function PayrollSettingsCard() {
  const { data: payrollSettings } = usePayrollSettings();
  const upsertPayroll = useUpsertPayrollSettings();

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Payroll Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Pay Period</Label>
            <Select
              value={payrollSettings?.pay_period_type || 'weekly'}
              onValueChange={v => upsertPayroll.mutate({ pay_period_type: v })}
            >
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Week Starts</Label>
            <Select
              value={String(payrollSettings?.week_start_day ?? 1)}
              onValueChange={v => upsertPayroll.mutate({ week_start_day: parseInt(v) })}
            >
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Missing Shift Buffer (min)</Label>
            <Input
              type="number"
              min={0}
              value={payrollSettings?.missing_shift_buffer_minutes ?? 60}
              onChange={e => upsertPayroll.mutate({ missing_shift_buffer_minutes: parseInt(e.target.value) || 60 })}
              className="w-24 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Timezone</Label>
            <p className="text-sm font-medium px-3 py-2 rounded-md border bg-muted">Eastern (ET)</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor="payroll-due-days">Payroll due (days after the period ends)</Label>
            <Input
              id="payroll-due-days"
              type="number"
              min={0}
              max={14}
              placeholder="not set"
              value={payrollSettings?.payroll_due_days_after_period ?? ''}
              onChange={e => {
                const raw = e.target.value.trim();
                const n = raw === '' ? null : Math.min(14, Math.max(0, parseInt(raw, 10) || 0));
                upsertPayroll.mutate({ payroll_due_days_after_period: n });
              }}
              className="w-24 text-sm"
            />
            <p className="text-xs text-muted-foreground">Blank means no payroll deadline is shown anywhere.</p>
          </div>
          {(payrollSettings?.pay_period_type || 'weekly') === 'biweekly' && (
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="pay-period-anchor">A known pay period start</Label>
              <Input
                id="pay-period-anchor"
                type="date"
                value={payrollSettings?.pay_period_anchor ?? ''}
                onChange={e => upsertPayroll.mutate({ pay_period_anchor: e.target.value || null })}
                className="w-40 text-sm"
              />
              <p className="text-xs text-muted-foreground">Bi-weekly periods are counted from this day.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
