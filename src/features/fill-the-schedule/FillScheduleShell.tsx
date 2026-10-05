import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useFillSchedule, useFillScheduleWrite } from '@/hooks/useFillSchedule';
import { campaignWeeks, weekKey } from '@/lib/fill-the-schedule';
import RecordTab from './RecordTab';
import MyPointsTab from './MyPointsTab';
import ReviewTab from './ReviewTab';
import ScorecardTab from './ScorecardTab';
import { Rules } from './RulesContent';
import { Settings } from './SettingsPanel';
import { ScanSettings } from './ScanSettings';
import { campaignDate, Field, input, secondary } from './ui';

export default function FillScheduleShell() {
  const q = useFillSchedule(); const writer = useFillScheduleWrite();
  const location = useLocation(); const navigate = useNavigate();
  const [chosenWeek, setChosenWeek] = useState(''); const [rules, setRules] = useState(false); const [settings, setSettings] = useState(false);
  if (q.isLoading || q.contextLoading) return <p className="p-6 text-muted-foreground">Loading Fill the Schedule…</p>;
  if (q.error || q.contextError) return <div role="alert" className="space-y-3 p-6"><p>Could not load the campaign. Refresh to try again.</p><button className={secondary} onClick={() => void q.refetch()}>Retry</button></div>;
  const d = q.data; if (!d) return <div className="space-y-3 p-6"><h1 className="text-2xl font-semibold">Fill the Schedule</h1><p>This office has no campaign configured.</p><Link to="/">Home</Link></div>;
  const weeks = campaignWeeks(d.campaign); const current = weekKey(new Date(), d.campaign);
  const week = weeks.includes(chosenWeek) ? chosenWeek : current;
  const tabs = q.manager ? [['review', 'Review'], ['scorecard', 'Weekly scorecard']] : [['record', 'Record'], ['points', 'My points']];
  const requested = location.hash.slice(1); const tab = tabs.some(([key]) => key === requested) ? requested : tabs[0][0];
  const employeeId = q.ctx?.employee_id ?? '';
  const unsetGroups = d.participants.filter(p => p.active && !p.scoring_role && (q.manager || p.employee_id === employeeId)).length;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 pb-20 sm:p-6">
    <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Home</Link>
    <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Q4 push · {campaignDate(d.campaign.starts_on)} to {campaignDate(d.campaign.ends_on)}, {d.campaign.ends_on.slice(0, 4)}</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Fill the Schedule</h1><p className="mt-2 text-muted-foreground">Record the action. Verify it. See the points.</p></div><div className="w-full sm:w-64"><Field title="Tally ending"><select className={input} value={week} onChange={e => setChosenWeek(e.target.value)}>{weeks.map(w => <option key={w} value={w}>{campaignDate(w)}{w === d.campaign.ends_on ? ' · final tally' : ' · Friday noon'}</option>)}</select></Field></div></header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div role="tablist" aria-label="Campaign workspace" className="flex flex-wrap gap-2">{tabs.map(([key, label]) => <button key={key} id={`fts-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`fts-panel-${key}`} className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium ${tab === key ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground'}`} onClick={() => navigate(`#${key}`, { replace: true })}>{label}</button>)}</div><div className="flex gap-2"><button className={secondary} onClick={() => setRules(true)}>Point rules</button>{q.manager && <button aria-label="Campaign Settings" className={secondary} onClick={() => setSettings(true)}><Settings2 className="h-4 w-4" /></button>}</div></div>
    {writer.error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{writer.error}</p>}{writer.message && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm">{writer.message}</p>}
    <div role="tabpanel" id={`fts-panel-${tab}`} aria-labelledby={`fts-tab-${tab}`}>
      {tab === 'record' && <RecordTab d={d} employeeId={employeeId} week={week} writer={writer} />}
      {tab === 'points' && <MyPointsTab d={d} employeeId={employeeId} week={week} writer={writer} />}
      {tab === 'review' && q.manager && <ReviewTab d={d} employeeId={employeeId} week={week} writer={writer} onSettings={() => setSettings(true)} />}
      {tab === 'scorecard' && q.manager && <ScorecardTab d={d} week={week} writer={writer} onReview={() => navigate('#review', { replace: true })} />}
    </div>
    <Sheet open={rules} onOpenChange={setRules}><SheetContent className="w-full overflow-y-auto sm:max-w-3xl"><SheetHeader><SheetTitle>Point rules</SheetTitle><SheetDescription>What earns points, who records it, and when it counts.</SheetDescription></SheetHeader><div className="mt-6 space-y-5">{unsetGroups > 0 && <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">Setup needed: {q.manager ? `${unsetGroups} scoring groups need confirmation in Settings.` : "Your scoring group needs confirmation before review points and prize eligibility can be determined."}</p>}<Rules c={d.campaign} /><div className="rounded-xl border p-4"><h3 className="font-semibold">Tally dates · Eastern time</h3><p className="mt-2 text-sm leading-relaxed">{weeks.map(campaignDate).join(' · ')}</p><p className="mt-2 text-xs text-muted-foreground">Friday noon closes each tally. The final tally includes December 31 and closes at midnight after that date.</p></div></div></SheetContent></Sheet>
    {q.manager && <Sheet open={settings} onOpenChange={setSettings}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>Campaign Settings</SheetTitle><SheetDescription>Confirm scoring groups, the chairside rate, and the sheet reader.</SheetDescription></SheetHeader><div className="mt-6 space-y-5"><Settings d={d} writer={writer} /><ScanSettings d={d} writer={writer} /></div></SheetContent></Sheet>}
  </div>;
}
