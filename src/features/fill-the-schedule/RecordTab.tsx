import { useRef, useState, type FormEvent } from 'react';
import { CalendarCheck, CreditCard, MessageSquare, Phone } from 'lucide-react';
import { activityRate, labels, localDateTime, officeTimestamp, score, weekKey } from '@/lib/fill-the-schedule';
import type { ActivityType, Ledger } from '@/lib/fill-the-schedule';
import { Panel, Field, TimeField, TeamSelect, nameOf, input, button, secondary, type Writer } from './ui';

const actions = ['qr_card', 'unscheduled_booking', 'operative_handoff', 'chairside_card'] as const;
const titles = {
  qr_card: 'Asked for a review and handed out the QR card',
  unscheduled_booking: 'Booked an appointment from the unscheduled treatment list',
  operative_handoff: 'Scheduled operative treatment before the patient left, including the walk-up',
  chairside_card: 'Presented card on file chairside on a case over $10,000',
};
const icons = { qr_card: MessageSquare, unscheduled_booking: Phone, operative_handoff: CalendarCheck, chairside_card: CreditCard };
export default function RecordTab({ d, employeeId, week, writer, manager = false }: { d: Ledger; employeeId: string; week: string; writer: Writer; manager?: boolean }) {
  const [kind, setKind] = useState<ActivityType | null>(null);
  const [person, setPerson] = useState(employeeId); const [bookedBy, setBookedBy] = useState('');
  const [when, setWhen] = useState(() => localDateTime(new Date(), d.campaign.timezone));
  const [confirmed, setConfirmed] = useState(false); const [error, setError] = useState('');
  const qrWhen = useRef<string | null>(null);
  const own = d.participants.find(p => p.employee_id === person);
  const ownScore = own ? score(d, own, week) : null;
  const enabled = manager ? !!person : !!own?.active;
  async function choose(type: typeof actions[number]) {
    if (type === 'qr_card' && !manager) {
      qrWhen.current ??= new Date().toISOString();
      if (await writer.write('fts_record_own', { p_campaign_id: d.campaign.id, p_type: type, p_occurred_at: qrWhen.current, p_quantity: 1 }, 'One completed QR ask added to your tally.', true)) qrWhen.current = null;
      return;
    }
    setKind(type); setConfirmed(false); setError(''); setWhen(localDateTime(new Date(), d.campaign.timezone));
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); if (!kind) return;
    try {
      const ok = await writer.write(manager ? 'fts_record_for' : 'fts_record_own', {
        p_campaign_id: d.campaign.id, ...(manager ? { p_employee_id: person } : {}), p_type: kind,
        p_occurred_at: officeTimestamp(when, d.campaign.timezone), p_quantity: 1, p_booked_by: kind === 'operative_handoff' ? bookedBy || null : null,
      }, kind === 'qr_card' ? 'QR ask recorded. Its point counts immediately.' : 'Report saved, awaiting manager verification.', true);
      if (ok) { setKind(null); setConfirmed(false); setBookedBy(''); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Choose a valid time.'); }
  }
  return <div className="space-y-5">
    <div><h2 className="text-xl font-semibold">{manager ? 'Record for a team member' : 'What did you complete?'}</h2><p className="mt-1 text-sm text-muted-foreground">Record each action once. Huddles, documented calls, posted reviews, and bonuses are handled by your manager.</p></div>
    {manager && <TeamSelect d={d} value={person} set={setPerson} />}
    <div className="grid gap-3 sm:grid-cols-2">{actions.map(type => {
      const Icon = icons[type]; const rate = activityRate(type, d.campaign, null);
      return <button key={type} type="button" className={`min-h-40 rounded-2xl border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${kind === type ? 'border-primary bg-primary/5' : ''}`} disabled={writer.busy || !enabled || d.campaign.status !== 'active'} onClick={() => void choose(type)}>
        <div className="mb-3 flex items-center justify-between gap-3"><Icon className="h-5 w-5 text-primary" /><span className={`rounded-full px-3 py-1 text-xs font-semibold ${rate == null ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-primary/10 text-primary'}`}>{rate == null ? 'Points not set yet' : `${rate} ${rate === 1 ? 'point' : 'points'}`}</span></div>
        <p className="font-semibold leading-snug">{titles[type]}</p>
        <p className="mt-2 text-sm text-muted-foreground">{type === 'qr_card' ? `Counts right away, honor system. Tap once per ask. ${ownScore?.qrCount ?? 0} so far this tally.` : type === 'unscheduled_booking' ? `Manager verifies. +${d.campaign.pts_attend_bonus} more when attendance is verified.` : type === 'operative_handoff' ? `Manager verifies. +${d.campaign.pts_prepay_bonus} more for verified actual prepayment.` : 'Manager verifies. Reports are kept until the rate is set.'}</p>
      </button>;
    })}</div>
    <p className="text-xs text-muted-foreground">Actions recorded now count in the tally ending {weekKey(new Date(), d.campaign)}. No patient details belong here.</p>
    {kind && <Panel title={labels[kind]} subtitle={manager ? `Credit to ${nameOf(d, person)}. This is a report until verified.` : 'Credit goes to you. Choose the time the action happened.'}>
      <form className="space-y-4" onSubmit={submit}>
        <TimeField value={when} set={setWhen} campaign={d.campaign} />
        {kind === 'operative_handoff' && <Field title="Booked by at the front desk · optional"><select className={input} value={bookedBy} onChange={e => setBookedBy(e.target.value)}><option value="">Not recorded</option>{d.names.filter(n => n.employment_status === 'active').map(n => <option key={n.id} value={n.id}>{n.display_name}</option>)}</select><span className="block text-xs font-normal text-muted-foreground">Cross-check only. This does not award the front-desk person extra points.</span></Field>}
        <label className="flex gap-3 text-sm leading-relaxed"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>{kind === 'operative_handoff' ? 'The operative appointment was on the schedule before the patient left, including the walk-up. I have not also recorded this on the front-desk sheet.' : kind === 'chairside_card' ? 'The case was over $10,000 and card on file was presented chairside. This action has not already been reported.' : kind === 'qr_card' ? 'I asked for a review and handed out the QR card.' : 'The appointment was booked from the unscheduled list and has not already been reported.'}</span></label>
        {kind === 'operative_handoff' && <p className="rounded-lg bg-muted/50 p-3 text-sm">Your manager checks the actual payment and adds the prepayment bonus. Card on file alone earns no prepayment bonus.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2"><button className={button} disabled={writer.busy || !enabled}>{kind === 'qr_card' ? 'Add completed QR ask' : 'Submit for verification'}</button><button className={secondary} type="button" onClick={() => setKind(null)}>Cancel</button></div>
      </form>
    </Panel>}
  </div>;
}
