import type { PaymentSchedule } from '@/lib/fof/payment-engine';
import type { FofComputation, FofTemplate } from '@/lib/fof/types';
import { formatCents } from '@/lib/fof/money';

/** Group the presentation only. Every collection event and amount remains intact. */
export function PatientPaymentOptions({ schedule, computation, template, prepayMark }: {
  schedule: PaymentSchedule; computation: FofComputation; template: FofTemplate; prepayMark: string;
}) {
  const sections: { key: string; title: string; rows: { id: string; label: string; cents: number }[] }[] = [];
  for (const row of schedule.rows) {
    const groupIds = [...new Set(row.allocations.filter(a => a.cents > 0).map(a => a.groupId))].sort();
    const key = JSON.stringify(groupIds);
    const title = groupIds.map(id => schedule.groupLabels[id]).filter(Boolean).join(' + ') || 'Payment';
    const prefix = `${title} — `;
    const eventLabel = row.label.startsWith(prefix) ? row.label.slice(prefix.length) : row.label;
    const label = eventLabel === 'When this phase is scheduled' ? 'At scheduling' : eventLabel;
    const previous = sections[sections.length - 1];
    const section = previous?.key === key ? previous : { key, title, rows: [] };
    if (section !== previous) sections.push(section);
    section.rows.push({ id: row.id, label, cents: row.cents });
  }
  const { effective } = computation;
  const both = template.showPrepayOption && template.showInstallmentOption;
  return <section className="fof-payment-options" aria-label="Payment options">
    {both && <div className="fof-options-head">Choose your payment option</div>}
    {template.showPrepayOption && <div className="fof-prepay-summary">
      <div><div className="fof-payment-kicker">{both ? 'Option 1 · ' : ''}Pay in full</div>
        <p>{effective.discountCents > 0 ? <>Save {formatCents(effective.discountCents)}{prepayMark} · {template.discountLabel}</> : 'One payment for your remaining balance'}</p>
      </div>
      <div className="fof-prepay-price"><strong>{formatCents(effective.prepayTotalCents)}</strong><span>Total with prepay</span></div>
    </div>}
    {template.showInstallmentOption && <div className="fof-phase-schedule">
      <div className="fof-payment-plan-head"><div className="fof-payment-kicker">{both ? 'Option 2 · ' : ''}Pay as treatment progresses</div><span>Payment schedule</span></div>
      {sections.map((section, index) => <div className="fof-payment-phase" key={`${section.key}:${index}`}>
        <div className="fof-payment-phase-name">{section.title}</div>
        <div className="fof-payment-milestones" style={{gridTemplateColumns:`repeat(${Math.min(section.rows.length,3)},minmax(0,1fr))`}}>{section.rows.map(row => <div className="fof-payment-milestone" key={row.id} data-payment-event={row.id}><span>{row.label}</span><strong>{formatCents(row.cents)}</strong></div>)}</div>
      </div>)}
      <div className="fof-payment-plan-total"><span>Total on payment plan</span><strong>{formatCents(schedule.remainingCents)}</strong></div>
    </div>}
  </section>;
}
