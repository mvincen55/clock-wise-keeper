import { useState, useMemo } from 'react';
import { useDaysOff, DayOffRow } from '@/hooks/useDaysOff';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CalendarDays, TrendingUp, Clock, Settings as SettingsIcon, Printer } from 'lucide-react';
import { formatDate, minutesToHHMM } from '@/lib/time-utils';

// PTO accrual tiers (per week, based on years of service)
const ACCRUAL_TIERS = [
  { minYears: 0, maxYears: 3, hoursPerWeek: 1.0, label: '0–3 years' },
  { minYears: 3, maxYears: 5, hoursPerWeek: 1.5, label: '3–5 years' },
  { minYears: 5, maxYears: 10, hoursPerWeek: 2.0, label: '5–10 years' },
  { minYears: 10, maxYears: 999, hoursPerWeek: 2.5, label: '10+ years' },
];

function getAccrualTier(hireDate: string) {
  const years = (Date.now() - new Date(hireDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return ACCRUAL_TIERS.find(t => years >= t.minYears && years < t.maxYears) || ACCRUAL_TIERS[0];
}

function getWeeksBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}

export default function PTO() {
  const [tab, setTab] = useState('overview');
  const [hireDate, setHireDate] = useState(() =>
    localStorage.getItem('pto_hire_date') || '2024-01-01'
  );
  const [snapshotDate, setSnapshotDate] = useState(() =>
    localStorage.getItem('pto_snapshot_date') || '2026-02-14'
  );
  const [snapshotBalance, setSnapshotBalance] = useState(() =>
    parseFloat(localStorage.getItem('pto_snapshot_balance') || '-1.63')
  );

  const { data: daysOff } = useDaysOff();
  const { data: payrollSettings } = usePayrollSettings();

  // Save settings to localStorage
  const saveSettings = () => {
    localStorage.setItem('pto_hire_date', hireDate);
    localStorage.setItem('pto_snapshot_date', snapshotDate);
    localStorage.setItem('pto_snapshot_balance', String(snapshotBalance));
  };

  const tier = getAccrualTier(hireDate);
  const today = new Date().toISOString().split('T')[0];

  // Compute PTO used since snapshot
  const ptoUsedSinceSnapshot = useMemo(() => {
    if (!daysOff) return 0;
    return daysOff
      .filter(d => d.date_start >= snapshotDate && d.type !== 'office_closed')
      .reduce((sum, d) => {
        const h = d.hours || 8;
        const days = Math.max(1, Math.ceil(
          (new Date(d.date_end + 'T00:00:00').getTime() - new Date(d.date_start + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000) + 1
        ));
        return sum + (d.hours ? d.hours : days * 8);
      }, 0);
  }, [daysOff, snapshotDate]);

  // Weeks accrued since snapshot
  const weeksSinceSnapshot = getWeeksBetween(snapshotDate, today);
  const accruedSinceSnapshot = weeksSinceSnapshot * tier.hoursPerWeek;
  const currentBalance = snapshotBalance + accruedSinceSnapshot - ptoUsedSinceSnapshot;

  // Current pay period PTO
  const weekStartDay = payrollSettings?.week_start_day ?? 1;
  const nowDate = new Date();
  const dayOfWeek = nowDate.getDay();
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
  const periodStart = new Date(nowDate);
  periodStart.setDate(nowDate.getDate() - daysBack);
  const periodStartStr = periodStart.toISOString().split('T')[0];
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodStart.getDate() + 6);
  const periodEndStr = periodEnd.toISOString().split('T')[0];

  const ptoThisPeriod = useMemo(() => {
    if (!daysOff) return 0;
    return daysOff
      .filter(d => d.date_start >= periodStartStr && d.date_start <= periodEndStr && d.type !== 'office_closed')
      .reduce((sum, d) => sum + (d.hours || 8), 0);
  }, [daysOff, periodStartStr, periodEndStr]);

  // Last 4 pay periods balance trend
  const balanceTrend = useMemo(() => {
    const periods: { label: string; balance: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const pStart = new Date(periodStart);
      pStart.setDate(pStart.getDate() - i * 7);
      const pEnd = new Date(pStart);
      pEnd.setDate(pStart.getDate() + 6);
      const ps = pStart.toISOString().split('T')[0];
      const pe = pEnd.toISOString().split('T')[0];

      const weeksFromSnapshot = getWeeksBetween(snapshotDate, pe);
      const accrued = weeksFromSnapshot * tier.hoursPerWeek;
      const used = (daysOff || [])
        .filter(d => d.date_start >= snapshotDate && d.date_start <= pe && d.type !== 'office_closed')
        .reduce((sum, d) => sum + (d.hours || 8), 0);

      periods.push({
        label: `${formatDate(ps)}`,
        balance: parseFloat((snapshotBalance + accrued - used).toFixed(2)),
      });
    }
    return periods;
  }, [daysOff, snapshotDate, snapshotBalance, tier.hoursPerWeek, periodStart]);

  // Usage list
  const ptoEntries = useMemo(() => {
    return (daysOff || [])
      .filter(d => d.type !== 'office_closed')
      .sort((a, b) => b.date_start.localeCompare(a.date_start));
  }, [daysOff]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">PTO</h1>
        <p className="text-muted-foreground">Track your paid time off balance and usage</p>
      </div>

      {/* Dashboard Widget */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${currentBalance < 0 ? 'text-destructive' : 'text-success'}`}>
              {currentBalance.toFixed(2)}h
            </p>
            <p className="text-xs text-muted-foreground">Current Balance</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{tier.hoursPerWeek}h</p>
            <p className="text-xs text-muted-foreground">Weekly Accrual</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{tier.hoursPerWeek}h</p>
            <p className="text-xs text-muted-foreground">Accrued This Period</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-warning">{ptoThisPeriod}h</p>
            <p className="text-xs text-muted-foreground">Used This Period</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accrual">Accrual History</TabsTrigger>
          <TabsTrigger value="usage">PTO Usage</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Balance Trend (Last 4 Pay Periods)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {balanceTrend.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                    <span className="text-sm text-muted-foreground">{p.label}</span>
                    <span className={`font-semibold time-display ${p.balance < 0 ? 'text-destructive' : 'text-success'}`}>
                      {p.balance.toFixed(2)}h
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
                <p className="text-muted-foreground">
                  Starting snapshot: As of {formatDate(snapshotDate)}, balance = <span className="font-semibold">{snapshotBalance.toFixed(2)}h</span>
                </p>
                <p className="text-muted-foreground mt-1">
                  Accrual tier: <span className="font-semibold">{tier.label}</span> ({tier.hoursPerWeek}h/week)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accrual">
          <Card className="card-elevated">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Accrual by Pay Period
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Period Start</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Accrued</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Used</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(() => {
                    const accrualRows: { start: string; accrued: number; used: number; balance: number }[] = [];
                    let running = snapshotBalance;
                    const snapDate = new Date(snapshotDate + 'T00:00:00');
                    const cur = new Date(snapDate);
                    // Align to week start
                    while (cur.getDay() !== weekStartDay) cur.setDate(cur.getDate() + 1);
                    
                    while (cur <= nowDate) {
                      const ps = cur.toISOString().split('T')[0];
                      const pe = new Date(cur);
                      pe.setDate(pe.getDate() + 6);
                      const peStr = pe.toISOString().split('T')[0];
                      
                      const used = (daysOff || [])
                        .filter(d => d.date_start >= ps && d.date_start <= peStr && d.type !== 'office_closed')
                        .reduce((sum, d) => sum + (d.hours || 8), 0);
                      
                      running = running + tier.hoursPerWeek - used;
                      accrualRows.push({ start: ps, accrued: tier.hoursPerWeek, used, balance: parseFloat(running.toFixed(2)) });
                      
                      cur.setDate(cur.getDate() + 7);
                    }
                    
                    return accrualRows.reverse().map((r, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{formatDate(r.start)}</td>
                        <td className="px-4 py-2 text-success">+{r.accrued.toFixed(2)}h</td>
                        <td className="px-4 py-2 text-destructive">{r.used > 0 ? `-${r.used.toFixed(2)}h` : '—'}</td>
                        <td className={`px-4 py-2 font-semibold time-display ${r.balance < 0 ? 'text-destructive' : ''}`}>
                          {r.balance.toFixed(2)}h
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                PTO Usage
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {ptoEntries.length === 0 ? (
                <p className="text-center text-muted-foreground py-12">No PTO entries recorded</p>
              ) : (
                <div className="divide-y">
                  {ptoEntries.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium">
                          {formatDate(d.date_start)}
                          {d.date_start !== d.date_end && ` — ${formatDate(d.date_end)}`}
                        </p>
                        {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded font-medium bg-primary/20 text-primary capitalize">
                          {d.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-sm font-semibold">{d.hours || 8}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                PTO Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>Hire Date</Label>
                <Input
                  type="date"
                  value={hireDate}
                  onChange={e => setHireDate(e.target.value)}
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  Current tier: {tier.label} → {tier.hoursPerWeek}h/week
                </p>
              </div>

              <div className="space-y-1">
                <Label>Snapshot Date</Label>
                <Input
                  type="date"
                  value={snapshotDate}
                  onChange={e => setSnapshotDate(e.target.value)}
                  className="w-48"
                />
                <p className="text-xs text-muted-foreground">
                  The date from which we compute the running balance forward.
                </p>
              </div>

              <div className="space-y-1">
                <Label>Snapshot Balance (hours)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={snapshotBalance}
                  onChange={e => setSnapshotBalance(parseFloat(e.target.value) || 0)}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  e.g. "As of 2/14/26, balance = -1.63h"
                </p>
              </div>

              <Button onClick={saveSettings}>Save PTO Settings</Button>

              <div className="mt-4 p-3 rounded-lg bg-muted/50">
                <h4 className="font-medium text-sm mb-2">Accrual Tiers</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {ACCRUAL_TIERS.map((t, i) => (
                    <div key={i} className="flex justify-between">
                      <span>{t.label}</span>
                      <span className="font-semibold">{t.hoursPerWeek}h/week</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
