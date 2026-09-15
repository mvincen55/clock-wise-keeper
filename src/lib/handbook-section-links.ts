/** Links to existing app workflows; these do not replace office submission rules. */
export function handbookSectionLink(title: string): { to: string; label: string } | null {
  const text = title.replace(/^\d+[.)]\s*/, '').replace(/:$/, '').trim().toLowerCase();
  if (/^(time off( request form)?|paid time off|pto|absences & leave requests)$/.test(text)) return { to: '/pto', label: 'Open Time Off & Requests' };
  if (/^huddle meeting & daily preparation$|^morning huddle$/.test(text)) return { to: '/morning-huddle', label: 'Open Morning Huddle' };
  if (/^(clerical logs\/checklists|checklists)$/.test(text)) return { to: '/checklists', label: 'Open Checklists' };
  if (/^incident reports?$/.test(text)) return { to: '/incident-reports', label: 'Open Incident Reports' };
  if (/broken appointment|late cancel|no-show|vip scheduling/.test(text)) return { to: '/broken-appointments', label: 'Open Broken Appointments' };
  return null;
}
