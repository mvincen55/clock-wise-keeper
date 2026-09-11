import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Button } from '@/components/ui/button';
import { FofPolicySettingsCard } from '@/components/settings/FofPolicySettingsCard';
import ProcedureMetaCard from '@/components/settings/ProcedureMetaCard';
import { BrokenApptSettingsCard } from '@/components/settings/BrokenApptSettingsCard';
import ScheduleIntelligenceSetupCard from '@/components/close-day/ScheduleIntelligenceSetupCard';
import DepositSettingsCard from '@/components/DepositSettingsCard';
import { scheduleReturnUrl } from '@/lib/close-day-navigation';

type Kind = 'fof' | 'broken-appointments' | 'schedule-intelligence' | 'deposits';
const TITLES: Record<Kind, string> = {
  fof: 'FOF Settings', 'broken-appointments': 'Broken Appointment Policy',
  'schedule-intelligence': 'Schedule Intelligence', deposits: 'Deposit Print Settings',
};

export default function WorkflowSettings({ kind }: { kind: Kind }) {
  const { data: ctx, isPending } = useOrgContext();
  const [params] = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const canConfigure = ctx?.role === 'owner' || ctx?.role === 'manager';
  useEffect(() => { heading.current?.focus(); }, [kind, canConfigure]);
  const date = params.get('closingDate');
  const back = kind === 'fof' ? '/fof' : kind === 'broken-appointments' ? '/broken-appointments' :
    date ? scheduleReturnUrl(date) : '/deposit-log';
  return <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild><Link to={back}>{kind === 'fof' ? 'Return to FOF' : kind === 'broken-appointments' ? 'Return to Broken Appointments' : 'Return to Close the Day'}</Link></Button>
      <Button variant="ghost" asChild><Link to="/settings/workflows">All workflow settings</Link></Button>
    </div>
    <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{TITLES[kind]}</h1>
    {isPending ? <p role="status">Loading permissions…</p> : !canConfigure ? <p>An owner or manager must configure these settings.</p> : <>
      {kind === 'fof' && <>
        <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/fof/templates">Templates</Link></Button><Button variant="outline" asChild><Link to="/fof/fees">Fees &amp; Plans</Link></Button></div>
        <FofPolicySettingsCard /><ProcedureMetaCard />
      </>}
      {kind === 'broken-appointments' && <BrokenApptSettingsCard />}
      {kind === 'schedule-intelligence' && <ScheduleIntelligenceSetupCard initiallyExpanded />}
      {kind === 'deposits' && <DepositSettingsCard />}
    </>}
  </div>;
}
