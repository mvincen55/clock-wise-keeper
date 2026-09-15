/** Links to existing app workflows; these do not replace office submission rules. */
export function handbookSectionLink(title: string): { to: string; label: string } | null {
  const text = title.replace(/^\d+[.)]\s*/, '').replace(/:$/, '').trim().toLowerCase();
  if (/^(time off( request form)?|paid time off|pto|absences & leave requests)$/.test(text)) return { to: '/pto', label: 'Open Time Off & Requests' };
  if (/^huddle meeting & daily preparation$|^morning huddle$/.test(text)) return { to: '/morning-huddle', label: 'Open Morning Huddle' };
  // Role sheets: a "Clerical Tasks" heading opens the Clerical tab rather than repeating the list.
  const sheet = /^(clerical|clinical|office manager( and management)?|management|manager) (tasks|logs?(\s*\/\s*| and )checklists?|checklists?)$/.exec(text);
  if (sheet) {
    const list = sheet[1].startsWith('clerical') ? 'clerical' : sheet[1].startsWith('clinical') ? 'clinical' : 'manager';
    const label = list === 'clinical' ? 'Open the Clinical checklists' : `Open the ${list[0].toUpperCase()}${list.slice(1)} checklist`;
    return { to: `/checklists?list=${list}`, label };
  }
  if (/^checklists$/.test(text)) return { to: '/checklists', label: 'Open Checklists' };
  if (/^incident reports?$/.test(text)) return { to: '/incident-reports', label: 'Open Incident Reports' };
  if (/broken appointment|late cancel|no-show|vip scheduling/.test(text)) return { to: '/broken-appointments', label: 'Open Broken Appointments' };
  return null;
}
