import { AlertTriangle, Check } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  businessHoursCutoff, isOnTime, parseLocalDateTime,
} from '@/lib/broken-appts/business-hours';
import { formatCutoff } from '@/lib/broken-appts/outputs';

/**
 * The business-hours cutoff calculator — shared by the wizard's "Not sure?
 * Check the cutoff" expander and the standalone side-panel tool, so every
 * surface computes from the same businessHoursCutoff() function. Purely
 * presentational: the caller owns the field values (never persisted — the
 * appointment time is patient data, see src/lib/broken-appts/types.ts).
 */

export interface BaCutoffValue {
  apptDate: string;
  apptTime: string;
  noticeDate: string;
  noticeTime: string;
}

interface BaCutoffCalculatorProps {
  value: BaCutoffValue;
  onChange: (patch: Partial<BaCutoffValue>) => void;
  noticeBusinessHours: number;
  officeClosedDates: string[];
  /** Distinguishes duplicate instances for a11y (e.g. "Tool "). */
  ariaPrefix?: string;
}

export default function BaCutoffCalculator({
  value,
  onChange,
  noticeBusinessHours,
  officeClosedDates,
  ariaPrefix = '',
}: BaCutoffCalculatorProps) {
  const apptAt = parseLocalDateTime(value.apptDate, value.apptTime);
  const noticeAt = parseLocalDateTime(value.noticeDate, value.noticeTime);
  const cutoff = apptAt ? businessHoursCutoff(apptAt, noticeBusinessHours, officeClosedDates) : null;
  const onTime =
    apptAt && noticeAt ? isOnTime(noticeAt, apptAt, noticeBusinessHours, officeClosedDates) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Appointment date &amp; time</Label>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label={`${ariaPrefix}Appointment date`}
              value={value.apptDate}
              onChange={e => onChange({ apptDate: e.target.value })}
            />
            <Input
              type="time"
              aria-label={`${ariaPrefix}Appointment time`}
              value={value.apptTime}
              onChange={e => onChange({ apptTime: e.target.value })}
              className="w-32"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>When the notice arrived</Label>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label={`${ariaPrefix}Notice date`}
              value={value.noticeDate}
              onChange={e => onChange({ noticeDate: e.target.value })}
            />
            <Input
              type="time"
              aria-label={`${ariaPrefix}Notice time`}
              value={value.noticeTime}
              onChange={e => onChange({ noticeTime: e.target.value })}
              className="w-32"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Defaults to now — use the message's timestamp when it arrived earlier.
          </p>
        </div>
      </div>

      {cutoff && (
        <Alert variant={onTime === false ? 'destructive' : 'default'}>
          {onTime === false ? <AlertTriangle className="h-4 w-4" /> : <Check className="h-4 w-4" />}
          <AlertTitle>Cutoff for enough notice: {formatCutoff(cutoff)}</AlertTitle>
          <AlertDescription>
            {noticeBusinessHours} business hours before the appointment — weekends
            {officeClosedDates.length > 0 ? ' and office closed dates' : ''} don't count.
            {onTime !== null &&
              (onTime
                ? ' This notice made it in time.'
                : ' This notice is inside the window — the policy applies.')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
