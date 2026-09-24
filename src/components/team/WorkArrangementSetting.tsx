import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrgContext } from '@/hooks/useOrgContext';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type Member = { id: string; clocks_in?: boolean | null; pto_eligible?: boolean | null };

/**
 * How the office tracks this person: on the time clock or not, accruing PTO
 * or not. Both default on; a doctor on the roster for the schedule reader
 * turns both off. Saved through the audited set_employee_work_arrangement
 * endpoint (owner or manager only); history is never touched.
 */
export default function WorkArrangementSetting({ employee }: { employee: Member }) {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const allowed = ctx?.role === 'owner' || ctx?.role === 'manager';
  if (!allowed) return null;
  const clocksIn = employee.clocks_in !== false;
  const ptoEligible = employee.pto_eligible !== false;

  async function change(next: { clocksIn: boolean; ptoEligible: boolean }) {
    setSaving(true);
    try {
      const r = await supabase.rpc('set_employee_work_arrangement', {
        p_employee_id: employee.id, p_clocks_in: next.clocksIn, p_pto_eligible: next.ptoEligible,
      });
      if (r.error) throw r.error;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['org-employees'] }),
        qc.invalidateQueries({ queryKey: ['org-employees-archived'] }),
        qc.invalidateQueries({ queryKey: ['employee-detail', employee.id] }),
        qc.invalidateQueries({ queryKey: ['employee-setup', employee.id] }),
        qc.invalidateQueries({ queryKey: ['org-attendance-snapshot'] }),
        qc.invalidateQueries({ queryKey: ['org-context'] }),
      ]);
      toast.success(next.clocksIn === clocksIn
        ? (next.ptoEligible ? 'Accrues PTO' : 'Does not accrue PTO')
        : (next.clocksIn ? 'On the time clock' : 'Not on the time clock'));
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Could not save how this person is tracked');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border p-3 mb-3 space-y-3">
      <p className="text-sm font-medium">Time clock and PTO</p>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`clocks-in-${employee.id}`}>Uses the time clock</Label>
        <Switch id={`clocks-in-${employee.id}`} checked={clocksIn} disabled={saving}
          onCheckedChange={v => change({ clocksIn: v, ptoEligible })} />
      </div>
      <p className="text-xs text-muted-foreground">Turn off for someone who is on the schedule but never punches, like a doctor. They are left out of attendance, missing-time and payroll checks, and never read as absent.</p>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`pto-eligible-${employee.id}`}>Accrues PTO</Label>
        <Switch id={`pto-eligible-${employee.id}`} checked={ptoEligible} disabled={saving}
          onCheckedChange={v => change({ clocksIn, ptoEligible: v })} />
      </div>
      <p className="text-xs text-muted-foreground">Turn off for someone who does not earn PTO. Balances, accrual and requests do not apply to them.</p>
    </div>
  );
}
