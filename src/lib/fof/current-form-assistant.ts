import type { FofAmounts, FofComputation } from './types';
import type { PaymentPolicy } from './payment-policy';
import { formatCents } from './money';

/** Browser-only snapshot. Deliberately has no patient name or external transport. */
export interface CurrentFofContext {
  amounts: FofAmounts;
  computation: FofComputation;
  treatment: string;
  lines: { code: string; tooth: string; description: string; insuranceCents: number; writeOffCents: number; feeCents: number }[];
  insurance: { enabled: boolean; scheduleId: string | null; paymentScheduleId?: string | null; scheduleName: string; deductibleCents: number; annualMaximumCents: number; settings: string; manuallyOverridden: boolean };
  policy: PaymentPolicy | null;
  issues: string[];
}
export interface LocalOfficeNote { code: string; notes: string; scheduleId: string; scheduleName: string; isUniversal: boolean }

const cash = (value: number | null | undefined) => value == null ? 'not entered' : formatCents(value);

/** Exact explanations of the live computation, without sending a question or
 * any part of the snapshot to AI. Unknown questions stay local and say so. */
export function answerCurrentForm(question: string, form: CurrentFofContext | null, notes: LocalOfficeNote[] = []): string {
  if (!form) return 'Open or enter a Financial Options Form first. I can then explain its totals, payment groups, insurance estimate, and code-bank notes here in the browser.';
  const q = question.toLowerCase();
  const { amounts, computation, insurance } = form;
  const schedule = computation.paymentSchedule;
  const requestedCode = /\bD\d{4}\b/i.exec(question)?.[0].toUpperCase();
  const applicable = notes.filter(note => (!requestedCode || note.code.toUpperCase() === requestedCode) &&
    form.lines.some(line => line.code.toUpperCase() === note.code.toUpperCase()) &&
    (note.isUniversal || note.scheduleId === insurance.scheduleId || note.scheduleId === insurance.paymentScheduleId));
  const noteText = applicable.map(note => `${note.code} — ${note.isUniversal ? 'Office code bank' : note.scheduleName}: ${note.notes}`).join('\n');
  if (/\b(insur|coverage|cover|benefit|deductible|maximum|annual|max|downgrad|carrier|eligib|claim)/.test(q)) {
    if (!insurance.enabled) return 'Insurance estimates are turned off for the current form. Select an insurance template and enter the plan settings to calculate an estimate.';
    const lines = form.lines.filter(line => !requestedCode || line.code.toUpperCase() === requestedCode);
    return [
      `Insurance on this form: ${insurance.scheduleName || 'No carrier selected'}.`,
      `Estimated insurance: ${cash(amounts.insuranceEstimateCents)}. Estimated write-off: ${cash(amounts.writeOffCents)}. Patient portion: ${cash(computation.effective.patientPortionCents)}.`,
      `Entered remaining deductible: ${cash(insurance.deductibleCents)}. Entered remaining annual maximum: ${cash(insurance.annualMaximumCents)}.`,
      insurance.settings,
      insurance.manuallyOverridden ? 'The insurance or write-off total has a staff override; it can differ from the line estimates below.' : '',
      lines.map(line => `${line.code}${line.tooth ? ` #${line.tooth}` : ''}: office fee ${cash(line.feeCents)}, estimated insurance ${cash(line.insuranceCents)}, write-off ${cash(line.writeOffCents)}.`).join('\n'),
      noteText,
      'These are the current form’s estimates and entered benefits, not a live eligibility check or a guarantee of claim payment. Confirm missing plan limits, exclusions and eligibility with the carrier.',
    ].filter(Boolean).join('\n\n');
  }
  if (/\b(group|restoration|crown|implant|visit|phase|treatment|twice|duplicate|combine|separat)/.test(q)) {
    return [
      schedule ? 'The current payment groups are:\n' + [...new Set(schedule.rows.flatMap(row => row.allocations.filter(a => a.cents > 0).map(a => a.groupId)))].map(id => `• ${schedule.groupLabels[id]}`).join('\n') : form.treatment,
      'These headings describe treatment courses and tooth numbers, not numbered visits. Surgery and restoration stay separate. Related work can span appointments; separate teeth or courses can produce separate crown headings. The editor’s current grouping and any staff corrections determine the result.',
      schedule ? schedule.rows.map(row => `${row.label}: ${cash(row.cents)}`).join('\n') : '',
      noteText,
      form.issues.length ? `Items to review:\n${form.issues.join('\n')}` : 'To correct this form, edit its treatment name, grouping or classification in Payment groups & collection events. That changes this form only.',
    ].filter(Boolean).join('\n\n');
  }
  if ((requestedCode || /\b(note|code|policy|rule)\b/.test(q)) && noteText) return `${noteText}\n\nOnly universal office notes and notes for the selected carrier are included. Other carriers’ notes do not apply automatically.`;
  if (/\b(pay|payments?|owe|owes|portion|total|cost|amount|balance|discount|prepay|saving|credit|adjust|deposit|paid|due|explain|summary|collect|collection|scheduling)\b/.test(q)) {
    return [
      `Total estimated fees: ${cash(amounts.totalCents)}. Insurance estimate: ${cash(amounts.insuranceEstimateCents)}. Write-off: ${cash(amounts.writeOffCents)}.`,
      `Patient portion on this form: ${cash(computation.effective.patientPortionCents)}. Prepay discount: ${cash(computation.effective.discountCents)}. Total with prepay: ${cash(computation.effective.prepayTotalCents)}.`,
      (amounts.officeDiscountCents || amounts.patientCreditCents || amounts.autoDiscount?.cents || amounts.membershipCoveredCents) ?
        `Other deductions: office discount ${cash(amounts.officeDiscountCents ?? 0)}, account credit ${cash(amounts.patientCreditCents ?? 0)}, ${amounts.autoDiscount?.label || 'automatic discount'} ${cash(amounts.autoDiscount?.cents ?? 0)}, membership-covered care ${cash(amounts.membershipCoveredCents ?? 0)}.` : '',
      schedule ? `Remaining on the payment plan: ${cash(schedule.remainingCents)}.\n${schedule.rows.map(row => `• ${row.label}: ${cash(row.cents)}`).join('\n')}` : computation.installmentLabels.map((label, i) => `${label}: ${cash(computation.effective.installmentsCents[i])}`).join('\n'),
      Object.values(computation.overridden).some(value => Array.isArray(value) ? value.some(Boolean) : value) ? 'This form contains staff overrides. The amounts above reflect the values currently shown on the form.' : '',
      form.issues.length ? `Review before printing:\n${form.issues.join('\n')}` : '',
      form.policy ? `Office collection threshold: ${cash(form.policy.thresholdCents)}${form.policy.inclusive ? ' or more uses the upper tier' : '; only amounts above it use the upper tier'}. The confirmed treatment group or arrangement determines which tier applies. The final payment absorbs cent rounding so the schedule reconciles exactly.` : '',
      'Payment amounts come from the office payment rules and the current form’s adjustments. Prepay and the payment plan are alternative options; they are not added together.',
    ].filter(Boolean).join('\n\n');
  }
  return 'I can explain this form’s total, prepay discount, payment schedule, treatment groups, insurance estimate, deductible, annual maximum, or a procedure’s code-bank notes. Try “Why is this the patient portion?” or “What does insurance cover?” Your question and this form stay in this browser. Use Office knowledge for a general office-policy question.';
}
