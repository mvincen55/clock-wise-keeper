import type { PaymentRow, PaymentSchedule } from './payment-engine';

/** Adjacent treatment sections preserve event order. Shared events appear once. */
export function paymentSections(schedule: PaymentSchedule) {
  const sections: { key: string; groupIds: string[]; title: string; rows: PaymentRow[] }[] = [];
  for (const row of schedule.rows) {
    const groupIds = [...new Set(row.allocations.filter(a => a.cents > 0).map(a => a.groupId))].sort();
    const key = JSON.stringify(groupIds);
    const previous = sections.at(-1);
    const section = previous?.key === key ? previous : {
      key, groupIds,
      title: groupIds.map(id => schedule.groupLabels[id]).filter(Boolean).join(' + ') || 'Payment',
      rows: [],
    };
    if (section !== previous) sections.push(section);
    section.rows.push(row);
  }
  return sections;
}
