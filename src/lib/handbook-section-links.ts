import type { DocBlock } from '@/lib/doc-format';

/** Links to existing app workflows; these do not replace office submission rules. */
export function handbookSectionLink(title: string): { to: string; label: string } | null {
  const text = title.replace(/^\d+[.)]\s*/, '').replace(/:$/, '').trim().toLowerCase();
  if (/^(time off( request form)?|paid time off|pto|absences & leave requests)$/.test(text)) return { to: '/pto', label: 'Open Time Off & Requests' };
  if (/^huddle meeting & daily preparation$|^morning huddle$/.test(text)) return { to: '/morning-huddle', label: 'Open Morning Huddle' };
  if (/^(clerical logs\/checklists|checklists)$/.test(text)) return { to: '/checklists', label: 'Open Checklists' };
  if (/^incident reports?$/.test(text)) return { to: '/incident-reports', label: 'Open Incident Reports' };
  if (/^broken appointments?$/.test(text)) return { to: '/broken-appointments', label: 'Open Broken Appointments' };
  return null;
}

/** Repair an isolated list number followed by a short section label, visually only. */
export function handbookNumberedHeading(blocks: DocBlock[], index: number): { number: string; title: string } | null {
  const block = blocks[index];
  const number = block?.type === 'para' ? block.text : block?.type === 'bullets' && block.items.length === 1 ? block.items[0] : '';
  const next = blocks[index + 1];
  if (!/^\d+[.)]$/.test(number.trim()) || next?.type !== 'para' || next.text.length > 100 || !/:$/.test(next.text.trim())) return null;
  return { number: number.trim(), title: next.text };
}
