import type { ReactNode } from 'react';
import type { useFillScheduleWrite } from '@/hooks/useFillSchedule';
import { localDateTime, officeTimestamp, weekKey } from '@/lib/fill-the-schedule';
import type { Activity, Campaign, Ledger } from '@/lib/fill-the-schedule';
export const input = 'min-h-11 w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';
export const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50';
export const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium disabled:opacity-50';
export type Writer = ReturnType<typeof useFillScheduleWrite>;
export const nameOf = (d: Ledger, id: string) => d.names.find(n => n.id === id)?.display_name || 'Team member';
export const campaignDate = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="rounded-2xl border bg-card p-5 sm:p-6"><h2 className="text-lg font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}<div className="mt-5">{children}</div></section>;
}
export function Field({ title, children }: { title: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium"><span>{title}</span>{children}</label>;
}
export function TimeField({ value, set, campaign }: { value: string; set: (v: string) => void; campaign: Campaign }) {
  let tally = '';
  try { tally = weekKey(officeTimestamp(value, campaign.timezone), campaign); } catch { /* Incomplete date input. */ }
  return <Field title="When the action happened · Eastern time"><input className={input} type="datetime-local" required min={`${campaign.starts_on}T00:00`} max={localDateTime(new Date(), campaign.timezone)} value={value} onChange={e => set(e.target.value)} />{tally && <span className="block text-xs font-normal text-muted-foreground">Counts in the tally ending {tally}.</span>}</Field>;
}
export function TeamSelect({ d, value, set }: { d: Ledger; value: string; set: (id: string) => void }) {
  return <Field title="Team member"><select className={input} required value={value} onChange={e => set(e.target.value)}><option value="">Choose a team member</option>{d.participants.filter(p => p.active && d.names.some(n => n.id === p.employee_id && n.employment_status === 'active')).map(p => <option key={p.id} value={p.employee_id}>{nameOf(d, p.employee_id)}</option>)}</select></Field>;
}
export function Status({ row }: { row: Activity }) {
  const style = row.status === 'approved' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : row.status === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground';
  return <span className={`inline-block max-w-full shrink-0 self-start rounded-full px-2 py-1 text-xs font-medium ${style}`}>{row.status === 'approved' ? `${row.awarded_points} approved ${row.awarded_points === 1 ? "point" : "points"}` : row.status === 'pending' ? 'Awaiting verification' : row.status}</span>;
}
